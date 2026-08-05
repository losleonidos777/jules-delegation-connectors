#!/usr/bin/env node
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const apiKey = process.env.JULES_API_KEY;
if (!apiKey) {
  console.error('JULES_API_KEY required');
  process.exit(2);
}
const requestedSessionId = process.argv[2];

const child = spawn(process.execPath, ['./bin/jules-mcp.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, JULES_API_KEY: apiKey },
  stdio: ['pipe', 'pipe', 'pipe']
});

let buffer = '';
const pending = new Map();
let nextId = 1;

function send(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout waiting for ${method} id=${id}`));
    }, 45000);
    pending.set(id, {
      resolve: message => {
        clearTimeout(timer);
        resolve(message);
      },
      reject
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

child.stdout.on('data', chunk => {
  buffer += chunk.toString('utf8');
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    const item = pending.get(message.id);
    if (item) {
      pending.delete(message.id);
      item.resolve(message);
    }
  }
});
child.stderr.on('data', chunk => process.stderr.write(chunk));

async function run() {
  const init = await send('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'live-smoke', version: '1' }
  });
  assert.equal(init.result.serverInfo.name, 'jules-delegate-mcp');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');

  const toolList = await send('tools/list', {});
  const toolNames = toolList.result.tools.map(tool => tool.name).sort();
  for (const required of ['jules_list_sources', 'jules_list_sessions', 'jules_get_session', 'jules_get_bash_outputs', 'jules_list_changed_files', 'jules_get_file_diff']) {
    assert.ok(toolNames.includes(required), `missing tool ${required}`);
  }

  const sources = await send('tools/call', { name: 'jules_list_sources', arguments: {} });
  assert.ok(Array.isArray(sources.result.structuredContent), 'list_sources structuredContent is not an array');
  console.log('jules_list_sources returned', sources.result.structuredContent.length, 'source(s)');

  const sessions = await send('tools/call', { name: 'jules_list_sessions', arguments: { pageSize: 10 } });
  assert.ok(Array.isArray(sessions.result.structuredContent), 'list_sessions structuredContent is not an array');
  console.log('jules_list_sessions returned', sessions.result.structuredContent.length, 'session(s)');

  const sessionId = requestedSessionId || sessions.result.structuredContent[0]?.name || sessions.result.structuredContent[0]?.id;
  if (sessionId) {
    const session = await send('tools/call', { name: 'jules_get_session', arguments: { sessionId } });
    assert.ok(session.result.structuredContent?.name || session.result.structuredContent?.id, 'session payload missing id');
    console.log('jules_get_session ->', session.result.structuredContent.name || session.result.structuredContent.id, session.result.structuredContent.state);
  } else {
    console.log('No sessions available; skipped jules_get_session read.');
  }

  const errorCall = await send('tools/call', { name: 'jules_get_session', arguments: {} });
  assert.equal(errorCall.result?.isError, true, 'expected isError=true for missing sessionId');
  assert.doesNotMatch(errorCall.result.content[0].text, /test-key|AQ\.|AIza/, 'error output leaked a key');

  console.log('MCP live tool-call smoke PASSED');
  child.stdin.end();
}

run().catch(error => {
  console.error('MCP live tool-call smoke FAILED:', error.message);
  child.kill();
  process.exit(1);
});
