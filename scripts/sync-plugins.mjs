#!/usr/bin/env node
import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const sources = ['bin', 'src'];
const plugins = [
  path.join(root, 'plugins', 'claude-jules-delegate'),
  path.join(root, 'plugins', 'codex-jules-delegate')
];

let mismatches = 0;
for (const plugin of plugins) {
  for (const sourceName of sources) {
    const source = path.join(root, sourceName);
    const destination = path.join(plugin, sourceName);
    if (checkOnly) {
      mismatches += await compareDirectories(source, destination);
    } else {
      await rm(destination, { recursive: true, force: true });
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(source, destination, { recursive: true });
      console.log(`synced ${path.relative(root, destination)}`);
    }
  }
}

if (checkOnly) {
  if (mismatches) {
    console.error(`plugin source check failed: ${mismatches} mismatch(es)`);
    process.exit(1);
  }
  console.log('plugin source check passed');
}

async function compareDirectories(source, destination) {
  const sourceFiles = await listFiles(source);
  const destinationFiles = await listFiles(destination).catch(() => []);
  let count = 0;
  if (sourceFiles.join('\n') !== destinationFiles.join('\n')) {
    console.error(`file list differs: ${path.relative(root, destination)}`);
    count += 1;
  }
  for (const relative of sourceFiles) {
    try {
      const [left, right] = await Promise.all([
        readFile(path.join(source, relative)),
        readFile(path.join(destination, relative))
      ]);
      if (!left.equals(right)) {
        console.error(`content differs: ${path.relative(root, path.join(destination, relative))}`);
        count += 1;
      }
    } catch {
      console.error(`missing file: ${path.relative(root, path.join(destination, relative))}`);
      count += 1;
    }
  }
  return count;
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}
