#!/usr/bin/env node
// Live MCP tool-call smoke: drives the stdio server with real JULES_API_KEY,
// calls jules_list_sources and jules_get_session, asserts results parse.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const apiKey = process.env.JULES_API_KEY;
if (!apiKey) {
  console.error('JULES_API_KEY required');
  process.exit(2);
}
const sessionId = process.argv[2] || 'sessions/17377204978182872982';

const child = spawn(process.execPath, ['./bin/jules-mcp.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, JULES_API_KEY: apiKey },
  stdio: ['pipe', 'pipe', 'pipe']
});

let buf = '';
const pending = new Map();
let nextId = 1;
function send(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for response to ${method} id=${id}`));
      }
    }, 30000);
  });
}

child.stdout.on('data', chunk => {
  buf += chunk.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p.resolve(msg); }
  }
});
child.stderr.on('data', c => process.stderr.write(c));

async function run() {
  const init = await send('initialize', { protocolVersion: '2025-06-18' });
  assert.equal(init.result.serverInfo.name, 'jules-delegate-mcp', 'serverInfo.name');

  const toolList = await send('tools/list', {});
  const toolNames = toolList.result.tools.map(t => t.name).sort();
  console.log('tools:', toolNames.join(', '));
  for (const required of ['jules_list_sources', 'jules_create_session', 'jules_get_session', 'jules_list_activities', 'jules_get_plan', 'jules_approve_plan', 'jules_send_message', 'jules_get_result', 'jules_get_patch']) {
    assert.ok(toolNames.includes(required), `missing tool ${required}`);
  }

  const sources = await send('tools/call', { name: 'jules_list_sources', arguments: {} });
  assert.ok(sources.result, 'jules_list_sources had no result');
  const sourcesPayload = sources.result.structuredContent;
  assert.ok(Array.isArray(sourcesPayload), 'list_sources structuredContent is not array');
  console.log('jules_list_sources returned', sourcesPayload.length, 'source(s)');

  const ses = await send('tools/call', { name: 'jules_get_session', arguments: { sessionId } });
  assert.ok(ses.result, 'jules_get_session had no result');
  const sesPayload = ses.result.structuredContent;
  assert.ok(sesPayload && sesPayload.name && sesPayload.name.startsWith('sessions/'), 'session payload missing name');
  console.log('jules_get_session ->', sesPayload.name, sesPayload.state);

  const errCall = await send('tools/call', { name: 'jules_get_session', arguments: { sessionId: 'sessions/0' } });
  const errPayload = errCall.result && errCall.result.content && errCall.result.content[0] && errCall.result.content[0].text;
  console.log('error path tool isError=', errCall.result && errCall.result.isError, 'text head:', String(errPayload || '').slice(0, 120));
  assert.ok(errCall.result && errCall.result.isError === true, 'expected isError=true for invalid session');

  console.log('MCP tool-call smoke PASSED');
  child.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('MCP tool-call smoke FAILED:', err.message);
  child.kill();
  process.exit(1);
});
