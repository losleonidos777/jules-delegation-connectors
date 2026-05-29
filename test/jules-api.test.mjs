import test from 'node:test';
import assert from 'node:assert/strict';
import { JulesApi } from '../src/jules-api.mjs';

test('createSession sends alpha REST payload with sourceContext and plan approval', async () => {
  const calls = [];
  const api = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ name: 'sessions/123', state: 'AWAITING_PLAN_APPROVAL' }), { status: 200 });
    }
  });

  const session = await api.createSession({
    prompt: '# Jules Task\n\n## Goal\nFix bug',
    title: 'Fix bug',
    source: 'sources/org-repo',
    branch: 'main',
    requirePlanApproval: true,
    autoCreatePr: true
  });

  assert.equal(session.name, 'sessions/123');
  assert.equal(calls[0].url, 'https://example.test/v1alpha/sessions');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-Goog-Api-Key'], 'test-key');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.sourceContext.source, 'sources/org-repo');
  assert.equal(body.sourceContext.githubRepoContext.startingBranch, 'main');
  assert.equal(body.requirePlanApproval, true);
  assert.equal(body.automationMode, 'AUTO_CREATE_PR');
});

test('listSources follows pagination', async () => {
  const urls = [];
  const api = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async (url) => {
      urls.push(String(url));
      const hasPageToken = String(url).includes('pageToken=next');
      const body = hasPageToken
        ? { sources: [{ name: 'sources/two' }] }
        : { sources: [{ name: 'sources/one' }], nextPageToken: 'next' };
      return new Response(JSON.stringify(body), { status: 200 });
    }
  });

  const sources = await api.listSources({ pageSize: 1 });
  assert.deepEqual(sources.map(source => source.name), ['sources/one', 'sources/two']);
  assert.equal(urls.length, 2);
});

test('JulesApiError stores redacted JSON response bodies', async () => {
  const api = new JulesApi({
    apiKey: 'test-key',
    baseUrl: 'https://example.test/v1alpha',
    fetchImpl: async () => new Response(JSON.stringify({
      error: {
        message: 'bad key',
        apiKey: 'secret-api-key',
        token: 'secret-token'
      }
    }), { status: 401 })
  });

  await assert.rejects(
    () => api.listSources(),
    error => {
      assert.equal(error.body.error.apiKey, '[REDACTED]');
      assert.equal(error.body.error.token, '[REDACTED]');
      return true;
    }
  );
});
