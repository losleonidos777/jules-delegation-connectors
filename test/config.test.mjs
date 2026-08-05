import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

test('package and plugin versions are aligned', async () => {
  const packageJson = await readJson('package.json');
  const claude = await readJson('plugins/claude-jules-delegate/.claude-plugin/plugin.json');
  const codex = await readJson('plugins/codex-jules-delegate/.codex-plugin/plugin.json');
  assert.equal(packageJson.version, VERSION);
  assert.equal(claude.version, VERSION);
  assert.equal(codex.version, VERSION);
});

test('Claude and Codex plugin MCP JSON use mcpServers', async () => {
  for (const relative of ['plugins/claude-jules-delegate/.mcp.json', 'plugins/codex-jules-delegate/.mcp.json']) {
    const config = await readJson(relative);
    assert.ok(config.mcpServers?.jules, `${relative} missing mcpServers.jules`);
    assert.equal(Object.hasOwn(config, 'mcp_servers'), false, `${relative} uses TOML naming in JSON`);
  }
  const codex = await readJson('plugins/codex-jules-delegate/.mcp.json');
  assert.equal(codex.mcpServers.jules.cwd, '.');
});

test('live smoke contains no hard-coded session id or credential', async () => {
  const script = await readFile(path.join(root, 'scripts/smoke-mcp-toolcalls.mjs'), 'utf8');
  assert.doesNotMatch(script, /sessions\/\d{8,}/);
  assert.doesNotMatch(script, /AQ\.[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}/);
});

test('repository text contains no obvious real Google API key', async () => {
  const files = await walk(root);
  for (const file of files) {
    if (file.includes(`${path.sep}.git${path.sep}`) || file.includes(`${path.sep}node_modules${path.sep}`)) continue;
    const text = await readFile(file, 'utf8').catch(() => '');
    assert.doesNotMatch(text, /\bAQ\.[A-Za-z0-9_-]{24,}\b|\bAIza[0-9A-Za-z_-]{24,}\b/, path.relative(root, file));
  }
});

async function walk(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await walk(target));
    else if (entry.isFile()) out.push(target);
  }
  return out;
}
