import { JulesApiError, redactSecrets } from './errors.mjs';

export const DEFAULT_BASE_URL = 'https://jules.googleapis.com/v1alpha';

export function sessionName(input) {
  const value = String(input || '').trim();
  if (!value) throw new Error('session id is required');
  return value.startsWith('sessions/') ? value : `sessions/${value}`;
}

export function sourceName(input) {
  const value = String(input || '').trim();
  if (!value) throw new Error('source name is required');
  return value.startsWith('sources/') ? value : `sources/${value}`;
}

export class JulesApi {
  constructor({ apiKey = process.env.JULES_API_KEY, baseUrl = process.env.JULES_API_BASE_URL || DEFAULT_BASE_URL, fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new Error('Missing JULES_API_KEY. Export it before calling Jules.');
    if (!fetchImpl) throw new Error('Missing fetch implementation. Use Node.js 20+ or pass fetchImpl.');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl;
  }

  async request(method, path, { query, body } = {}) {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    const headers = {
      'Accept': 'application/json',
      'X-Goog-Api-Key': this.apiKey
    };
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await this.fetch(url, init);
    const text = await response.text();
    const parsed = parseJsonOrText(text);
    if (!response.ok) {
      throw new JulesApiError(`Jules API request failed`, {
        status: response.status,
        body: parsed,
        url: String(url),
        method
      });
    }
    return parsed === '' ? {} : parsed;
  }

  async listSources({ pageSize = 100, filter } = {}) {
    const sources = [];
    let pageToken = undefined;
    do {
      const res = await this.request('GET', '/sources', { query: { pageSize, pageToken, filter } });
      sources.push(...(res.sources || []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return sources;
  }

  async getSource(name) {
    return this.request('GET', `/${sourceName(name)}`);
  }

  async createSession({ prompt, title, source, branch, requirePlanApproval = true, autoCreatePr = false }) {
    const body = {
      prompt,
      title,
      sourceContext: {
        source: sourceName(source),
        githubRepoContext: {
          startingBranch: branch
        }
      },
      requirePlanApproval: Boolean(requirePlanApproval)
    };

    if (autoCreatePr) body.automationMode = 'AUTO_CREATE_PR';
    if (!body.title) delete body.title;
    if (!body.sourceContext.githubRepoContext.startingBranch) {
      delete body.sourceContext.githubRepoContext.startingBranch;
    }
    if (Object.keys(body.sourceContext.githubRepoContext).length === 0) {
      delete body.sourceContext.githubRepoContext;
    }

    return this.request('POST', '/sessions', { body });
  }

  async listSessions({ pageSize = 30 } = {}) {
    const sessions = [];
    let pageToken = undefined;
    do {
      const res = await this.request('GET', '/sessions', { query: { pageSize, pageToken } });
      sessions.push(...(res.sessions || []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return sessions;
  }

  async getSession(sessionId) {
    return this.request('GET', `/${sessionName(sessionId)}`);
  }

  async deleteSession(sessionId) {
    return this.request('DELETE', `/${sessionName(sessionId)}`);
  }

  async approvePlan(sessionId) {
    return this.request('POST', `/${sessionName(sessionId)}:approvePlan`, { body: {} });
  }

  async sendMessage(sessionId, prompt) {
    return this.request('POST', `/${sessionName(sessionId)}:sendMessage`, { body: { prompt } });
  }

  async listActivities(sessionId, { pageSize = 100 } = {}) {
    const activities = [];
    let pageToken = undefined;
    do {
      const res = await this.request('GET', `/${sessionName(sessionId)}/activities`, { query: { pageSize, pageToken } });
      activities.push(...(res.activities || []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return activities;
  }
}

function parseJsonOrText(text) {
  if (!text) return '';
  try {
    return JSON.parse(text);
  } catch {
    return redactSecrets(text);
  }
}
