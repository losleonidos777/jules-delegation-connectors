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
}, 5000);

let output = '';
let passed = false;
child.stdout.on('data', chunk => {
  output += chunk.toString('utf8');
  const lines = output.split('\n').filter(Boolean);
  if (!passed && lines.length >= 3) {
    const initialize = JSON.parse(lines[0]);
    const tools = JSON.parse(lines[1]);
    const unknown = JSON.parse(lines[2]);
    assert.equal(initialize.result.serverInfo.name, 'jules-delegate-mcp');
    assert.equal(initialize.result.protocolVersion, '2025-11-25');
    assert.ok(tools.result.tools.some(tool => tool.name === 'jules_create_session'));
    assert.ok(tools.result.tools.some(tool => tool.name === 'jules_get_bash_outputs'));
    assert.ok(tools.result.tools.some(tool => tool.name === 'jules_list_changed_files'));
    assert.ok(tools.result.tools.some(tool => tool.name === 'jules_get_file_diff'));
    assert.equal(unknown.error.code, -32601);
    passed = true;
    clearTimeout(timer);
    child.stdin.end();
    console.log('MCP smoke test passed');
  }
});

child.stderr.on('data', chunk => process.stderr.write(chunk));
child.on('exit', code => {
  clearTimeout(timer);
  if (!passed) process.exit(code || 1);
  process.exit(0);
});

child.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } }
}) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'unknown/method', params: {} }) + '\n');
