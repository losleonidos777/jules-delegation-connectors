export function toCamelCase(flagName) {
  return String(flagName).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const raw = token.slice(2);
    if (!raw) continue;

    if (raw.startsWith('no-')) {
      flags[toCamelCase(raw.slice(3))] = false;
      continue;
    }

    const eqIndex = raw.indexOf('=');
    if (eqIndex >= 0) {
      const key = toCamelCase(raw.slice(0, eqIndex));
      flags[key] = raw.slice(eqIndex + 1);
      continue;
    }

    const key = toCamelCase(raw);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }

  return { positional, flags };
}

export function flagNumber(flags, key, fallback) {
  const value = flags[key];
  if (value === undefined || value === true || value === false || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number`);
  return parsed;
}

export function flagString(flags, key, fallback = undefined) {
  const value = flags[key];
  if (value === undefined) return fallback;
  if (value === true || value === false) throw new Error(`--${key} requires a value`);
  return String(value);
}
