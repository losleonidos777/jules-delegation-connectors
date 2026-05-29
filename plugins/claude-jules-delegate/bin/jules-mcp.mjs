#!/usr/bin/env node
import { TOOLS, callTool } from '../src/mcp-tools.mjs';
import { formatError, redactSecrets } from '../src/errors.mjs';

const SERVER_INFO = { name: 'jules-delegate-mcp', version: '0.1.0' };
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';
const framing = process.env.MCP_FRAMING || 'newline';
let buffer = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  drainBuffer().catch(error => {
    sendError(null, -32603, formatError(error));
  });
});

process.stdin.on('end', () => process.exit(0));

async function drainBuffer() {
  while (buffer.length) {
    if (buffer.startsWith('Content-Length:')) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = buffer.slice(0, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) throw new Error('Invalid Content-Length header');
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) return;
      const body = buffer.slice(bodyStart, bodyStart + length);
      buffer = buffer.slice(bodyStart + length);
      await handleMessage(JSON.parse(body));
      continue;
    }

    const newline = buffer.indexOf('\n');
    if (newline < 0) return;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    await handleMessage(JSON.parse(line));
  }
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== '2.0') {
    sendError(message?.id ?? null, -32600, 'Invalid JSON-RPC request');
    return;
  }

  if (!('id' in message)) {
    // Notification. initialized/cancelled notifications do not require a response.
    return;
  }

  try {
    const result = await dispatch(message.method, message.params || {});
    send({ jsonrpc: '2.0', id: message.id, result });
  } catch (error) {
    sendError(message.id, -32603, redactSecrets(formatError(error)));
  }
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion || DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const toolName = params.name;
      const args = params.arguments || {};
      try {
        const { text, data } = await callTool(toolName, args);
        return {
          content: [{ type: 'text', text }],
          structuredContent: data
        };
      } catch (toolError) {
        // Per MCP spec, tool-execution failures must surface as result.isError=true,
        // not as JSON-RPC error responses (which signal protocol/transport faults).
        return {
          isError: true,
          content: [{ type: 'text', text: redactSecrets(formatError(toolError)) }]
        };
      }
    }
    default:
      throw new Error(`Unsupported MCP method: ${method}`);
  }
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function send(message) {
  const payload = JSON.stringify(message);
  if (framing === 'content-length') {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`);
  } else {
    process.stdout.write(`${payload}\n`);
  }
}
