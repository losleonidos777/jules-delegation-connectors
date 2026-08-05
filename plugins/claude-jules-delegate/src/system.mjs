import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(nodeExecFile);

export async function inspectJulesCli({ cwd = process.cwd(), execFileImpl = execFile } = {}) {
  try {
    const result = await execFileImpl('jules', ['--version'], { cwd, encoding: 'utf8', timeout: 5000 });
    const output = firstLine(result?.stdout || result?.stderr || result);
    return { available: true, version: output || undefined };
  } catch (error) {
    if (error?.code === 'ENOENT') return { available: false };
    const output = firstLine(error?.stdout || error?.stderr);
    return {
      available: true,
      version: output || undefined,
      diagnostic: error?.message || String(error)
    };
  }
}

function firstLine(value) {
  return String(value || '').trim().split(/\r?\n/, 1)[0];
}
