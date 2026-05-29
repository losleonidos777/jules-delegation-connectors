import { readFile } from 'node:fs/promises';

export async function readTextFileOrStdin(filePath, stdin = process.stdin) {
  if (!filePath) return undefined;
  if (filePath === '-') return readStdin(stdin);
  return readFile(filePath, 'utf8');
}

export async function readStdin(stdin = process.stdin) {
  return new Promise((resolve, reject) => {
    let data = '';
    stdin.setEncoding('utf8');
    stdin.on('data', chunk => {
      data += chunk;
    });
    stdin.on('end', () => resolve(data));
    stdin.on('error', reject);
  });
}

export function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function print(text = '') {
  process.stdout.write(`${text}\n`);
}
