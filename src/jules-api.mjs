import { JulesApiError, redactSecrets } from './errors.mjs';

export const DEFAULT_BASE_URL = 'https://jules.googleapis.com/v1alpha';
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function normalizeEnvValue(input) {
  if (input === undefined || input === null) return undefined;
  const value = String(input).trim();
  if (!value || /^\$\{[^}]+\}$/.test(value)) return undefined;
  return value;
}

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

export function activityName(sessionId, activityId) {
  const raw = String(activityId || '').trim();
  if (!raw) throw new Error('activity id is required');
  if (raw.startsWith('sessions/')) return raw;
  const id = raw.includes('/') ? raw.split('/').filter(Boolean).at(-1) : raw;
  return `${sessionName(sessionId)}/activities/${encodeURIComponent(id)}`;
}

export class JulesApi {
  constructor({
    apiKey = normalizeEnvValue(process.env.JULES_API_KEY),
    baseUrl = normalizeEnvValue(process.env.JULES_API_BASE_URL) || DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    requestTimeoutMs = positiveInteger(process.env.JULES_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    maxRetries = nonNegativeInteger(process.env.JULES_MAX_RETRIES, DEFAULT_MAX_RETRIES)
  } = {}) {
    const normalizedKey = normalizeEnvValue(apiKey);
    if (!normalizedKey) throw new Error('Missing JULES_API_KEY. Configure it before calling Jules.');
    if (!fetchImpl) throw new Error('Missing fetch implementation. Use Node.js 20+ or pass fetchImpl.');

    const normalizedBaseUrl = normalizeEnvValue(baseUrl) || DEFAULT_BASE_URL;
    let parsedBaseUrl;
    try {
      parsedBaseUrl = new URL(normalizedBaseUrl);
    } catch {
      throw new Error(`Invalid JULES_API_BASE_URL: ${normalizedBaseUrl}`);
    }
    if (!['https:', 'http:'].includes(parsedBaseUrl.protocol)) {
      throw new Error(`JULES_API_BASE_URL must use http or https; got ${parsedBaseUrl.protocol}`);
    }

    this.apiKey = normalizedKey;
    this.baseUrl = normalizedBaseUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl;
    this.requestTimeoutMs = positiveInteger(requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    this.maxRetries = nonNegativeInteger(maxRetries, DEFAULT_MAX_RETRIES);
  }

  async request(method, path, { query, body } = {}) {
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    const headers = {
      Accept: 'application/json',
      'X-Goog-Api-Key': this.apiKey
    };
    const baseInit = { method: normalizedMethod, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      baseInit.body = JSON.stringify(body);
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
      const timer = controller
        ? setTimeout(() => controller.abort(new Error('request timeout')), this.requestTimeoutMs)
        : undefined;

      let response;
      let text;
      try {
        response = await this.fetch(url, { ...baseInit, signal: controller?.signal });
        text = await response.text();
      } catch (error) {
        if (timer) clearTimeout(timer);
        const retryable = normalizedMethod === 'GET' && attempt < this.maxRetries;
        if (retryable) {
          await sleep(backoffMs(attempt));
          continue;
        }
        const timedOut = controller?.signal.aborted;
        throw new JulesApiError(timedOut ? 'Jules API request timed out' : 'Jules API request failed before receiving a response', {
          url: String(url),
          method: normalizedMethod,
          retryable,
          cause: error
        });
      }
      if (timer) clearTimeout(timer);

      const parsed = parseJsonOrText(text);
      if (response.ok) return parsed === '' ? {} : parsed;

      const retryable = normalizedMethod === 'GET' && RETRYABLE_STATUS.has(response.status);
      if (retryable && attempt < this.maxRetries) {
        await sleep(retryDelayMs(response.headers?.get?.('retry-after'), attempt));
        continue;
      }

      throw new JulesApiError('Jules API request failed', {
        status: response.status,
        body: parsed,
        url: String(url),
        method: normalizedMethod,
        retryable
      });
    }

    throw new JulesApiError('Jules API request failed after retries', {
      url: String(url),
      method: normalizedMethod,
      retryable: true
    });
  }

  async listSources({ pageSize = 100, filter } = {}) {
    const sources = [];
    let pageToken;
    do {
      const res = await this.request('GET', '/sources', { query: { pageSize: clampPageSize(pageSize), pageToken, filter } });
      sources.push(...asArray(res.sources));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return sources;
  }

  async getSource(name) {
    return this.request('GET', `/${sourceName(name)}`);
  }

  async createSession({ prompt, title, source, branch, requirePlanApproval = true, autoCreatePr = false }) {
    if (!String(prompt || '').trim()) throw new Error('prompt is required');
    if (autoCreatePr && !source) throw new Error('AUTO_CREATE_PR requires a repository source');

    const body = {
      prompt: String(prompt),
      title,
      requirePlanApproval: Boolean(requirePlanApproval)
    };

    if (source) {
      body.sourceContext = { source: sourceName(source) };
      if (branch) body.sourceContext.githubRepoContext = { startingBranch: String(branch) };
    }
    if (autoCreatePr) body.automationMode = 'AUTO_CREATE_PR';
    if (!body.title) delete body.title;

    return this.request('POST', '/sessions', { body });
  }

  async listSessions({ pageSize = 30 } = {}) {
    const sessions = [];
    let pageToken;
    do {
      const res = await this.request('GET', '/sessions', { query: { pageSize: clampPageSize(pageSize), pageToken } });
      sessions.push(...asArray(res.sessions));
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
    if (!String(prompt || '').trim()) throw new Error('prompt is required');
    return this.request('POST', `/${sessionName(sessionId)}:sendMessage`, { body: { prompt: String(prompt) } });
  }

  async listActivities(sessionId, { pageSize = 100, since } = {}) {
    const cursor = since ? Date.parse(String(since)) : undefined;
    if (since && !Number.isFinite(cursor)) throw new Error(`since must be a valid RFC 3339 timestamp; got: ${since}`);

    const activities = [];
    let pageToken;
    do {
      const res = await this.request('GET', `/${sessionName(sessionId)}/activities`, {
        query: { pageSize: clampPageSize(pageSize), pageToken, createTime: since }
      });
      activities.push(...asArray(res.activities));
      pageToken = res.nextPageToken;
    } while (pageToken);

    if (cursor === undefined) return activities;
    return activities.filter(activity => {
      const createdAt = Date.parse(String(activity?.createTime || ''));
      return !Number.isFinite(createdAt) || createdAt > cursor;
    });
  }

  async getActivity(sessionId, activityId) {
    return this.request('GET', `/${activityName(sessionId, activityId)}`);
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clampPageSize(value) {
  const parsed = positiveInteger(value, 100);
  return Math.min(100, parsed);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function backoffMs(attempt) {
  return Math.min(4000, 250 * (2 ** attempt));
}

function retryDelayMs(retryAfter, attempt) {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(30000, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(30000, Math.max(0, date - Date.now()));
  }
  return backoffMs(attempt);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
