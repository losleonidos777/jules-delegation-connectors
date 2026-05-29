export class UserInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserInputError';
  }
}

export class JulesApiError extends Error {
  constructor(message, { status, body, url, method } = {}) {
    super(message);
    this.name = 'JulesApiError';
    this.status = status;
    this.body = redactObject(body);
    this.url = url;
    this.method = method;
  }
}

export function formatError(error) {
  if (!error) return 'Unknown error';
  let out = `${error.name || 'Error'}: ${error.message || String(error)}`;
  if (error.status) out += `\nHTTP status: ${error.status}`;
  if (error.method && error.url) out += `\nRequest: ${error.method} ${error.url}`;
  if (error.body) out += `\nResponse: ${redactSecrets(error.body)}`;
  return out;
}

export function redactSecrets(input) {
  if (input === undefined || input === null) return input;
  let text = typeof input === 'string' ? input : JSON.stringify(input, null, 2);

  text = text.replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]+?-----END [^-]+ PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]');

  const patterns = [
    /(JULES_API_KEY\s*[=:]\s*)[^\s"']+/gi,
    /(api[_-]?key\s*[=:]\s*)[^\s"']+/gi,
    /(["']?api[_-]?key["']?\s*:\s*["']?)[^"',\s}]+/gi,
    /(x-goog-api-key\s*[:=]\s*)[^\s"']+/gi,
    /(authorization\s*[:=]\s*bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
    /(password\s*[=:]\s*)[^\s"']+/gi,
    /(["']?password["']?\s*:\s*["']?)[^"',\s}]+/gi,
    /(token\s*[=:]\s*)[^\s"']+/gi,
    /(["']?token["']?\s*:\s*["']?)[^"',\s}]+/gi,
    /(secret\s*[=:]\s*)[^\s"']+/gi,
    /(["']?secret["']?\s*:\s*["']?)[^"',\s}]+/gi
  ];

  for (const pattern of patterns) {
    text = text.replace(pattern, '$1[REDACTED]');
  }
  return text;
}

export function redactObject(value) {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(redactSecrets(JSON.stringify(value)));
  } catch {
    return redactSecrets(value);
  }
}
