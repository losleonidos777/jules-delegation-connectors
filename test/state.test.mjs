import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalState, safeFileName } from '../src/state.mjs';

test('upsertSession serializes concurrent read-modify-write updates', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jules-state-'));
  try {
    const state = new LocalState({ stateDir: dir });
    await Promise.all([
      state.upsertSession({ name: 'sessions/one', state: 'COMPLETED' }),
      state.upsertSession({ name: 'sessions/two', state: 'FAILED' })
    ]);

    const saved = JSON.parse(await readFile(path.join(dir, 'sessions.json'), 'utf8'));
    assert.equal(saved.sessions['sessions/one'].state, 'COMPLETED');
    assert.equal(saved.sessions['sessions/two'].state, 'FAILED');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('safeFileName removes path separators from session ids', () => {
  assert.equal(safeFileName('../sessions/one'), '.._sessions_one');
  assert.equal(safeFileName('C:\\temp\\session'), 'C_temp_session');
});
