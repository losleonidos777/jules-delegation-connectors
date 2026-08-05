import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectJulesCli } from '../src/system.mjs';

test('detects an installed Jules CLI', async () => {
  const result = await inspectJulesCli({
    execFileImpl: async (command, args) => {
      assert.equal(command, 'jules');
      assert.deepEqual(args, ['--version']);
      return { stdout: 'jules 1.2.3\n' };
    }
  });
  assert.deepEqual(result, { available: true, version: 'jules 1.2.3' });
});

test('reports a missing Jules CLI as optional', async () => {
  const result = await inspectJulesCli({
    execFileImpl: async () => {
      const error = new Error('not found');
      error.code = 'ENOENT';
      throw error;
    }
  });
  assert.deepEqual(result, { available: false });
});
