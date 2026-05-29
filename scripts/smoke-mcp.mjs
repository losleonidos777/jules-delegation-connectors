#!/usr/bin/env node
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const child = spawn(process.execPath, ['./bin/jules-mcp.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, JULES_API_KEY: 'test-key' },
  stdio: ['pipe', 'pipe', 'pipe']
});

const timer = setTimeout(() => {
  console.error('MCP smoke test timed out');
  child.kill();
  process.exit(1);
}, 3000);

let output = '';
let passed = false;
child.stdout.on('data', chunk => {
  output += chunk.toString('utf8');
  const lines = output.trim().split('\n').filter(Boolean);
  if (!passed && lines.length >= 2) {
    const initialize = JSON.parse(lines[0]);
    const tools = JSON.parse(lines[1]);
    assert.equal(initialize.result.serverInfo.name, 'jules-delegate-mcp');
    assert.ok(tools.result.tools.some(tool => tool.name === 'jules_create_session'));
    passed = true;
    clearTimeout(timer);
    child.kill();
    console.log('MCP smoke test passed');
  }
});

child.stderr.on('data', chunk => process.stderr.write(chunk));
child.on('exit', code => {
  if (!passed && code !== 0 && code !== null) process.exit(code);
  if (passed) process.exit(0);
});

child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
