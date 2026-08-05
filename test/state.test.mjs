import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalState, safeFileName } from '../src/state.mjs';

test('upsertSession serializes concurrent updates and preserves known values', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jules-state-'));
  try {
    const state = new LocalState({ stateDir: dir });
    await Promise.all([
      state.upsertSession({ name: 'sessions/one', state: 'COMPLETED', title: 'One' }),
      state.upsertSession({ name: 'sessions/two', state: 'FAILED' })
    ]);
    await state.upsertSession({ name: 'sessions/one', state: 'COMPLETED', title: undefined }, { branch: 'main' });

    const saved = JSON.parse(await readFile(path.join(dir, 'sessions.json'), 'utf8'));
    assert.equal(saved.sessions['sessions/one'].title, 'One');
    assert.equal(saved.sessions['sessions/one'].branch, 'main');
    assert.equal(saved.sessions['sessions/two'].state, 'FAILED');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saved prompts redact secrets and filenames remove separators', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jules-state-'));
  try {
    const state = new LocalState({ stateDir: dir });
    await state.savePrompt('sessions/one', `JULES_API_KEY=AQ.${'x'.repeat(30)}`);
    const prompt = await readFile(path.join(dir, 'prompts', 'sessions_one.md'), 'utf8');
    assert.doesNotMatch(prompt, /AQ\./);
    assert.match(prompt, /REDACTED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  assert.equal(safeFileName('../sessions/one'), '.._sessions_one');
  assert.equal(safeFileName('C:\\temp\\session'), 'C_temp_session');
});
