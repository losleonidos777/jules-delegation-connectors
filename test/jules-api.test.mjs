import test from 'node:test';
import assert from 'node:assert/strict';
import { JulesApi, activityName, normalizeEnvValue } from '../src/jules-api.mjs';

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers });
}

test('createSession sends repository-backed payload with safe defaults', async () => {
  const calls = [];
  const api = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ name: 'sessions/123', state: 'AWAITING_PLAN_APPROVAL' });
    },
    maxRetries: 0
  });

  await api.createSession({
    prompt: '# Jules Task',
    title: 'Fix bug',
    source: 'sources/github/acme/repo',
    branch: 'main',
    requirePlanApproval: true,
    autoCreatePr: true
  });

  const body = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].url, 'https://example.test/v1alpha/sessions');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-Goog-Api-Key'], 'test-key');
  assert.equal(body.sourceContext.source, 'sources/github/acme/repo');
  assert.equal(body.sourceContext.githubRepoContext.startingBranch, 'main');
  assert.equal(body.requirePlanApproval, true);
  assert.equal(body.automationMode, 'AUTO_CREATE_PR');
});

test('createSession supports repoless payloads and rejects repoless auto-PR', async () => {
  let captured;
  const api = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async (_url, init) => {
      captured = JSON.parse(init.body);
      return jsonResponse({ name: 'sessions/repoless' });
    },
    maxRetries: 0
  });

  await api.createSession({ prompt: 'Build a parser', requirePlanApproval: false });
  assert.equal(Object.hasOwn(captured, 'sourceContext'), false);
  assert.equal(captured.requirePlanApproval, false);
  await assert.rejects(() => api.createSession({ prompt: 'bad', autoCreatePr: true }), /requires a repository source/);
});

test('listSources follows pagination and listActivities sends and defensively applies the createTime cursor', async () => {
  const urls = [];
  const api = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async url => {
      urls.push(String(url));
      if (String(url).includes('/activities')) {
        return jsonResponse({ activities: [
          { id: 'before', createTime: '2026-01-17T00:03:00Z' },
          { id: 'equal', createTime: '2026-01-17T00:03:53.137240Z' },
          { id: 'after', createTime: '2026-01-17T00:04:00Z' },
          { id: 'unknown' }
        ] });
      }
      const second = String(url).includes('pageToken=next');
      return jsonResponse(second
        ? { sources: [{ name: 'sources/two' }] }
        : { sources: [{ name: 'sources/one' }], nextPageToken: 'next' });
    },
    maxRetries: 0
  });

  const sources = await api.listSources({ pageSize: 1, filter: 'name=sources/one' });
  assert.deepEqual(sources.map(source => source.name), ['sources/one', 'sources/two']);
  const activities = await api.listActivities('sessions/1', { since: '2026-01-17T00:03:53.137240Z' });
  assert.deepEqual(activities.map(activity => activity.id), ['after', 'unknown']);
  assert.ok(urls.some(url => url.includes('createTime=2026-01-17T00%3A03%3A53.137240Z')));
  await assert.rejects(() => api.listActivities('sessions/1', { since: 'not-a-date' }), /valid RFC 3339/);
});

test('getActivity accepts ids and full resource names', async () => {
  const paths = [];
  const api = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async url => {
      paths.push(new URL(url).pathname);
      return jsonResponse({ id: 'a1' });
    },
    maxRetries: 0
  });
  await api.getActivity('1', 'a1');
  await api.getActivity('1', 'sessions/1/activities/a2');
  assert.deepEqual(paths, ['/v1alpha/sessions/1/activities/a1', '/v1alpha/sessions/1/activities/a2']);
  assert.equal(activityName('1', 'activities/a3'), 'sessions/1/activities/a3');
});

test('GET retries transient responses but POST is never retried', async () => {
  let getAttempts = 0;
  const readApi = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async () => {
      getAttempts += 1;
      return getAttempts < 2 ? jsonResponse({ error: 'busy' }, 503) : jsonResponse({ sources: [] });
    },
    maxRetries: 2
  });
  await readApi.listSources();
  assert.equal(getAttempts, 2);

  let postAttempts = 0;
  const writeApi = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async () => {
      postAttempts += 1;
      return jsonResponse({ error: 'busy' }, 503);
    },
    maxRetries: 3
  });
  await assert.rejects(() => writeApi.createSession({ prompt: 'task' }), error => error.status === 503 && error.retryable === false);
  assert.equal(postAttempts, 1);
});

test('deleteSession uses the documented DELETE endpoint without retries', async () => {
  const calls = [];
  const api = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response('', { status: 200 });
    },
    maxRetries: 3
  });
  await api.deleteSession('123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/v1alpha/sessions/123');
  assert.equal(calls[0].init.method, 'DELETE');
});

test('redacts API keys from JSON error bodies', async () => {
  const api = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async () => jsonResponse({ error: { apiKey: 'AQ.' + 'x'.repeat(30), token: 'secret-token' } }, 401),
    maxRetries: 0
  });
  await assert.rejects(() => api.listSources(), error => {
    assert.equal(error.body.error.apiKey, '[REDACTED]');
    assert.equal(error.body.error.token, '[REDACTED]');
    return true;
  });
});

test('normalizes unresolved environment placeholders', () => {
  assert.equal(normalizeEnvValue('${JULES_API_KEY}'), undefined);
  assert.equal(normalizeEnvValue('  '), undefined);
  assert.equal(normalizeEnvValue('value'), 'value');
});
