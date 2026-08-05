import { mkdir, readFile, writeFile, appendFile, rename, rm, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { redactSecrets } from './errors.mjs';

const LOCK_STALE_MS = 30000;
const LOCK_RETRY_MS = 25;
const LOCK_WAIT_MS = 10000;

export class LocalState {
  constructor({ stateDir = normalizedStateDir(process.env.JULES_STATE_DIR) || path.join(process.cwd(), '.jules-orchestrator') } = {}) {
    this.stateDir = normalizedStateDir(stateDir) || path.join(process.cwd(), '.jules-orchestrator');
    this.sessionsPath = path.join(this.stateDir, 'sessions.json');
    this.promptsDir = path.join(this.stateDir, 'prompts');
    this.logsDir = path.join(this.stateDir, 'logs');
    this.patchesDir = path.join(this.stateDir, 'patches');
    this.lockPath = path.join(this.stateDir, 'sessions.json.lock');
  }

  async ensure() {
    await mkdir(this.stateDir, { recursive: true });
    await mkdir(this.promptsDir, { recursive: true });
    await mkdir(this.logsDir, { recursive: true });
    await mkdir(this.patchesDir, { recursive: true });
  }

  async read() {
    await this.ensure();
    return this.readUnlocked();
  }

  async readUnlocked() {
    try {
      const parsed = JSON.parse(await readFile(this.sessionsPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return { sessions: {} };
      if (!parsed.sessions || typeof parsed.sessions !== 'object') parsed.sessions = {};
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') return { sessions: {} };
      throw error;
    }
  }

  async write(data) {
    await this.ensure();
    await this.withSessionsLock(() => this.writeUnlocked(data));
  }

  async writeUnlocked(data) {
    const tempPath = `${this.sessionsPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await rename(tempPath, this.sessionsPath);
  }

  async upsertSession(session, extra = {}) {
    await this.ensure();
    await this.withSessionsLock(async () => {
      const data = await this.readUnlocked();
      const key = session?.name || (session?.id ? `sessions/${session.id}` : extra.sessionId);
      if (!key) return;
      const next = { ...(data.sessions[key] || {}) };
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined) next[k] = v;
      }
      const fromSession = {
        name: session?.name,
        id: session?.id,
        title: session?.title,
        state: session?.state,
        url: session?.url,
        sourceContext: session?.sourceContext,
        createTime: session?.createTime,
        updateTime: session?.updateTime
      };
      for (const [k, v] of Object.entries(fromSession)) {
        if (v !== undefined) next[k] = v;
      }
      next.lastSeenAt = new Date().toISOString();
      data.sessions[key] = next;
      await this.writeUnlocked(data);
    });
  }

  async savePrompt(sessionId, prompt) {
    await this.ensure();
    const safeId = safeFileName(sessionId);
    await writeFile(path.join(this.promptsDir, `${safeId}.md`), redactSecrets(prompt), 'utf8');
  }

  async appendLog(sessionId, event) {
    await this.ensure();
    const safeId = safeFileName(sessionId);
    await appendFile(path.join(this.logsDir, `${safeId}.jsonl`), `${JSON.stringify(redactObject(event))}\n`, 'utf8');
  }

  async savePatch(sessionId, patch) {
    await this.ensure();
    const safeId = safeFileName(sessionId);
    const file = path.join(this.patchesDir, `${safeId}.patch`);
    await writeFile(file, patch, 'utf8');
    return file;
  }

  async withSessionsLock(fn) {
    const deadline = Date.now() + LOCK_WAIT_MS;
    let handle;
    while (!handle) {
      try {
        handle = await open(this.lockPath, 'wx');
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        await removeStaleLock(this.lockPath);
        if (Date.now() >= deadline) throw new Error(`Timed out waiting for state lock: ${this.lockPath}`);
        await sleep(LOCK_RETRY_MS);
      }
    }

    try {
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, 'utf8');
      return await fn();
    } finally {
      await handle.close();
      await rm(this.lockPath, { force: true });
    }
  }
}

export function safeFileName(input) {
  return String(input || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '_');
}

function redactObject(value) {
  return JSON.parse(redactSecrets(JSON.stringify(value)));
}

function normalizedStateDir(input) {
  if (input === undefined || input === null) return undefined;
  const value = String(input).trim();
  if (!value || /^\$\{[^}]+\}$/.test(value)) return undefined;
  return value;
}

async function removeStaleLock(lockPath) {
  try {
    let lockedAt;
    try {
      const raw = await readFile(lockPath, 'utf8');
      const [, timestamp] = raw.split('\n');
      lockedAt = Date.parse(timestamp);
    } catch {
      lockedAt = undefined;
    }
    if (!Number.isFinite(lockedAt)) {
      const info = await stat(lockPath);
      lockedAt = info.mtimeMs;
    }
    if (Date.now() - lockedAt > LOCK_STALE_MS) await rm(lockPath, { force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
