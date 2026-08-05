import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, callTool } from '../src/mcp-tools.mjs';

function memoryState() {
  return {
    upsertSession: async () => {},
    savePrompt: async () => {}
  };
}

test('tool catalog advertises read/write annotations and user interaction', () => {
  const list = TOOLS.find(tool => tool.name === 'jules_list_sources');
  const create = TOOLS.find(tool => tool.name === 'jules_create_session');
  assert.equal(list.annotations.readOnlyHint, true);
  assert.equal(create.annotations.readOnlyHint, false);
  assert.equal(create._meta['anthropic/requiresUserInteraction'], true);
  assert.equal(create.inputSchema.additionalProperties, false);
  assert.ok(TOOLS.some(tool => tool.name === 'jules_get_activity'));
  assert.ok(TOOLS.some(tool => tool.name === 'jules_get_bash_outputs'));
  assert.ok(TOOLS.some(tool => tool.name === 'jules_list_changed_files'));
  assert.ok(TOOLS.some(tool => tool.name === 'jules_get_file_diff'));
});

test('create session enforces prompt checklist', async () => {
  const api = { createSession: async () => ({ name: 'sessions/1' }) };
  await assert.rejects(
    () => callTool('jules_create_session', { prompt: 'do a thing', repoless: true }, { api, state: memoryState() }),
    /missing required sections/
  );
});

test('creates repoless sessions without resolving a source', async () => {
  let payload;
  const api = {
    createSession: async input => {
      payload = input;
      return { name: 'sessions/1', state: 'PLANNING' };
    }
  };
  const prompt = '# Jules Task\n\n## Goal\nBuild parser\n\n## Scope\nOne file\n\n## Constraints\nNo deps\n\n## Acceptance criteria\nTests pass\n\n## Validation commands\nnpm test\n\n## Out of scope\nOther work\n\n## PR policy\nNo PR';
  const result = await callTool('jules_create_session', { prompt, repoless: true }, { api, state: memoryState() });
  assert.equal(payload.source, undefined);
  assert.equal(payload.autoCreatePr, false);
  assert.equal(result.data.name, 'sessions/1');
});

test('returns compact result and capped patch metadata', async () => {
  const activities = [{
    id: 'a1',
    artifacts: [{ changeSet: { gitPatch: { unidiffPatch: 'x'.repeat(5000), baseCommitId: 'abc' } } }]
  }];
  const api = {
    getSession: async () => ({ name: 'sessions/1', state: 'COMPLETED' }),
    listActivities: async () => activities
  };
  const result = await callTool('jules_get_result', { sessionId: '1' }, { api, state: memoryState() });
  assert.equal(result.data.latestPatch.baseCommitId, 'abc');
  assert.equal(Object.hasOwn(result.data.latestPatch, 'unidiffPatch'), false);
  const patch = await callTool('jules_get_patch', { sessionId: '1', maxChars: 1000 }, { api, state: memoryState() });
  assert.equal(patch.data.truncated, true);
  assert.ok(patch.text.length < 1500);
});

test('lists changed files and returns a bounded per-file diff', async () => {
  const patchText = [
    'diff --git a/src/a.mjs b/src/a.mjs',
    '--- a/src/a.mjs',
    '+++ b/src/a.mjs',
    '@@ -1 +1 @@',
    '-a',
    '+' + 'b'.repeat(3000),
    ''
  ].join('\n');
  const api = {
    listActivities: async () => [{
      id: 'a1',
      artifacts: [{ changeSet: { gitPatch: { baseCommitId: 'abc', unidiffPatch: patchText } } }]
    }]
  };
  const listed = await callTool('jules_list_changed_files', { sessionId: '1' }, { api, state: memoryState() });
  assert.equal(listed.data[0].path, 'src/a.mjs');
  assert.doesNotMatch(JSON.stringify(listed.data), /bbbbbbbbbbbbbbbbbbbb/);

  const diff = await callTool('jules_get_file_diff', { sessionId: '1', filePath: 'src/a.mjs', maxChars: 1000 }, { api, state: memoryState() });
  assert.equal(diff.data.path, 'src/a.mjs');
  assert.equal(diff.data.truncated, true);
  assert.match(diff.text, /truncated/);
});
