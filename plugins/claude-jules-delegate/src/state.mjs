import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { redactSecrets } from './errors.mjs';

export class LocalState {
  constructor({ stateDir = process.env.JULES_STATE_DIR || path.join(process.cwd(), '.jules-orchestrator') } = {}) {
    this.stateDir = stateDir;
    this.sessionsPath = path.join(stateDir, 'sessions.json');
    this.promptsDir = path.join(stateDir, 'prompts');
    this.logsDir = path.join(stateDir, 'logs');
    this.patchesDir = path.join(stateDir, 'patches');
  }

  async ensure() {
    await mkdir(this.stateDir, { recursive: true });
    await mkdir(this.promptsDir, { recursive: true });
    await mkdir(this.logsDir, { recursive: true });
    await mkdir(this.patchesDir, { recursive: true });
  }

  async read() {
    await this.ensure();
    try {
      return JSON.parse(await readFile(this.sessionsPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { sessions: {} };
      throw error;
    }
  }

  async write(data) {
    await this.ensure();
    await writeFile(this.sessionsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  async upsertSession(session, extra = {}) {
    const data = await this.read();
    const key = session.name || (session.id ? `sessions/${session.id}` : extra.sessionId);
    if (!key) return;
    data.sessions[key] = {
      ...(data.sessions[key] || {}),
      ...extra,
      name: session.name,
      id: session.id,
      title: session.title,
      state: session.state,
      url: session.url,
      sourceContext: session.sourceContext,
      createTime: session.createTime,
      updateTime: session.updateTime,
      lastSeenAt: new Date().toISOString()
    };
    await this.write(data);
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
}

export function safeFileName(input) {
  return String(input || 'unknown').replace(/[^A-Za-z0-9._-]+/g, '_');
}

function redactObject(value) {
  return JSON.parse(redactSecrets(JSON.stringify(value)));
}
