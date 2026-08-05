#!/usr/bin/env node
import { TOOLS, callTool } from '../src/mcp-tools.mjs';
import { formatError, redactSecrets } from '../src/errors.mjs';
import { LATEST_MCP_PROTOCOL_VERSION, MCP_PROTOCOL_VERSIONS, VERSION } from '../src/version.mjs';

const SERVER_INFO = { name: 'jules-delegate-mcp', version: VERSION };
let buffer = '';
let draining = false;
let pendingDrain = false;
let stdinEnded = false;
let initialized = false;

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  scheduleDrain();
});
process.stdin.on('end', () => {
  stdinEnded = true;
  if (buffer.trim()) buffer += '\n';
  scheduleDrain();
});
process.stdin.on('error', error => {
  process.stderr.write(`${redactSecrets(formatError(error))}\n`);
});

function scheduleDrain() {
  if (draining) {
    pendingDrain = true;
    return;
  }
  draining = true;
  drainBuffer()
    .catch(error => process.stderr.write(`${redactSecrets(formatError(error))}\n`))
    .finally(() => {
      draining = false;
      if (pendingDrain) {
        pendingDrain = false;
        scheduleDrain();
      } else {
        maybeExit();
      }
    });
}

function maybeExit() {
  if (stdinEnded && !draining && buffer.length === 0) process.exit(0);
}

async function drainBuffer() {
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      sendError(null, -32700, 'Parse error');
      continue;
    }
    await handleMessage(message);
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    sendError(message?.id ?? null, -32600, 'Invalid Request');
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(message, 'id')) {
    if (message.method === 'notifications/initialized') initialized = true;
    return;
  }

  try {
    const result = await dispatch(message.method, message.params || {});
    send({ jsonrpc: '2.0', id: message.id, result });
  } catch (error) {
    const code = Number.isInteger(error?.rpcCode) ? error.rpcCode : -32603;
    sendError(message.id, code, redactSecrets(error?.message || formatError(error)));
  }
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      const protocolVersion = MCP_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_MCP_PROTOCOL_VERSION;
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Use read-only Jules tools freely. Create, approve, and message tools require explicit human authorization. Never send secrets in prompts.'
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      if (!params || typeof params.name !== 'string') throw rpcError(-32602, 'Invalid params: tools/call requires name');
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      try {
        const { text, data } = await callTool(params.name, args);
        const result = { content: [{ type: 'text', text: String(text ?? '') }] };
        if (data !== undefined) result.structuredContent = data;
        return result;
      } catch (toolError) {
        return {
          isError: true,
          content: [{ type: 'text', text: redactSecrets(formatError(toolError)) }]
        };
      }
    }
    default:
      throw rpcError(-32601, `Method not found: ${method}`);
  }
}

function rpcError(code, message) {
  const error = new Error(message);
  error.rpcCode = code;
  return error;
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

void initialized;
