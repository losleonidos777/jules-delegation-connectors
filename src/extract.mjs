export const WAITING_STATES = new Set(['AWAITING_PLAN_APPROVAL', 'AWAITING_USER_FEEDBACK']);
export const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'PAUSED']);
export const STOP_STATES = new Set([...WAITING_STATES, ...TERMINAL_STATES]);

export function sortActivities(activities) {
  return asArray(activities)
    .filter(activity => activity && typeof activity === 'object' && !Array.isArray(activity))
    .sort((a, b) => String(a.createTime || '').localeCompare(String(b.createTime || '')));
}

export function latestPlan(activities) {
  return sortActivities(activities).filter(activity => activity?.planGenerated?.plan).at(-1)?.planGenerated?.plan;
}

export function formatPlan(plan) {
  if (!plan) return 'No planGenerated activity found.';
  const lines = [`Plan ${plan.id || ''}`.trim()];
  asArray(plan.steps).forEach((rawStep, i) => {
    const step = rawStep || {};
    const index = Number.isFinite(Number(step.index)) ? Number(step.index) : i;
    const prefix = `${index + 1}.`;
    lines.push(`${prefix} ${step.title || step.description || step.id || '<untitled step>'}`);
    if (step.description && step.title && step.description !== step.title) lines.push(`   ${step.description}`);
  });
  return lines.join('\n');
}

function agentMessageText(activity) {
  const event = activity?.agentMessaged;
  return event ? asText(event.agentMessage || event.message || event.text) : '';
}

function userMessageText(activity) {
  const event = activity?.userMessaged;
  return event ? asText(event.userMessage || event.message || event.text) : '';
}

export function latestAgentMessage(activities) {
  for (const activity of sortActivities(activities).reverse()) {
    const text = agentMessageText(activity);
    if (text) return { text, createTime: activity.createTime, id: activity.id, name: activity.name };
  }
  return null;
}

export function extractPatches(activities) {
  const patches = [];
  for (const activity of sortActivities(activities)) {
    for (const artifact of asArray(activity?.artifacts)) {
      const gitPatch = artifact?.changeSet?.gitPatch;
      const patch = gitPatch?.unidiffPatch;
      if (typeof patch !== 'string' || !patch) continue;
      patches.push({
        activityId: activity.id,
        activityName: activity.name,
        createTime: activity.createTime,
        source: artifact.changeSet?.source,
        baseCommitId: gitPatch.baseCommitId,
        suggestedCommitMessage: gitPatch.suggestedCommitMessage,
        unidiffPatch: patch
      });
    }
  }
  return patches;
}

export function latestPatch(activities) {
  return extractPatches(activities).at(-1);
}

export function splitUnifiedDiff(unidiffPatch) {
  const text = asText(unidiffPatch);
  if (!text) return [];
  const starts = [];
  const pattern = /^diff --git .+$/gm;
  let match;
  while ((match = pattern.exec(text)) !== null) starts.push(match.index);
  if (!starts.length) return [];

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? text.length;
    const filePatch = text.slice(start, end);
    const lines = filePatch.split('\n');
    const [oldToken, newToken] = parseDiffGitHeader(lines[0]);
    let oldPath = stripGitPrefix(oldToken, 'a/');
    let newPath = stripGitPrefix(newToken, 'b/');

    for (const line of lines.slice(1, 12)) {
      if (line.startsWith('--- ')) oldPath = normalizePatchPath(line.slice(4), 'a/') || oldPath;
      if (line.startsWith('+++ ')) newPath = normalizePatchPath(line.slice(4), 'b/') || newPath;
    }

    let changeType = 'modified';
    if (/^new file mode /m.test(filePatch) || oldPath === '/dev/null') changeType = 'added';
    else if (/^deleted file mode /m.test(filePatch) || newPath === '/dev/null') changeType = 'deleted';
    else if (/^rename from /m.test(filePatch) || /^rename to /m.test(filePatch)) changeType = 'renamed';
    else if (/^copy from /m.test(filePatch) || /^copy to /m.test(filePatch)) changeType = 'copied';

    const path = newPath && newPath !== '/dev/null' ? newPath : oldPath;
    return {
      path,
      oldPath,
      newPath,
      changeType,
      bytes: Buffer.byteLength(filePatch, 'utf8'),
      unidiffPatch: filePatch
    };
  }).filter(file => file.path);
}

export function extractChangedFiles(activities) {
  const patch = latestPatch(activities);
  if (!patch) return [];
  return splitUnifiedDiff(patch.unidiffPatch).map(file => ({
    ...omit(file, ['unidiffPatch']),
    activityId: patch.activityId,
    activityName: patch.activityName,
    createTime: patch.createTime,
    baseCommitId: patch.baseCommitId
  }));
}

export function findFileDiff(activities, filePath) {
  const wanted = normalizeComparablePath(filePath);
  if (!wanted) return null;
  for (const patch of extractPatches(activities).reverse()) {
    for (const file of splitUnifiedDiff(patch.unidiffPatch)) {
      const candidates = [file.path, file.oldPath, file.newPath].map(normalizeComparablePath);
      if (!candidates.includes(wanted)) continue;
      return {
        ...file,
        activityId: patch.activityId,
        activityName: patch.activityName,
        createTime: patch.createTime,
        baseCommitId: patch.baseCommitId,
        suggestedCommitMessage: patch.suggestedCommitMessage
      };
    }
  }
  return null;
}

export function formatChangedFiles(files) {
  if (!files?.length) return 'No changed files found in the latest patch.';
  return files.map(file => `- ${file.changeType || 'modified'} ${file.path} (${file.bytes || 0} bytes)`).join('\n');
}

export function extractBashOutputs(activities) {
  const outputs = [];
  for (const activity of sortActivities(activities)) {
    for (const artifact of asArray(activity?.artifacts)) {
      const bash = artifact?.bashOutput;
      if (!bash || typeof bash !== 'object') continue;
      outputs.push({
        activityId: activity.id,
        activityName: activity.name,
        createTime: activity.createTime,
        command: asText(bash.command),
        output: asText(bash.output),
        exitCode: Number.isFinite(Number(bash.exitCode)) ? Number(bash.exitCode) : undefined
      });
    }
  }
  return outputs;
}

export function formatBashOutputs(outputs, { outputLimit = 4000 } = {}) {
  if (!outputs?.length) return 'No bashOutput artifacts found.';
  const lines = [];
  for (const item of outputs) {
    const status = item.exitCode === undefined ? 'exit unknown' : `exit ${item.exitCode}`;
    lines.push(`$ ${item.command || '<unknown command>'} (${status})`);
    if (item.output) lines.push(indent(truncateText(item.output, outputLimit), '  '));
  }
  return lines.join('\n');
}

export function extractPullRequests(session) {
  return asArray(session?.outputs).map(output => output?.pullRequest).filter(Boolean);
}

export function activityHeadline(activity) {
  if (!activity || typeof activity !== 'object') return '<activity>';
  if (activity.planGenerated) return 'Plan generated';
  if (activity.planApproved) return 'Plan approved';
  if (activity.userMessaged) return truncateText(userMessageText(activity), 180) || 'User message';
  if (activity.agentMessaged) return truncateText(agentMessageText(activity), 180) || 'Agent message';
  if (activity.progressUpdated) return activity.progressUpdated.title || activity.progressUpdated.description || 'Progress update';
  if (activity.sessionCompleted) return 'Session completed';
  if (activity.sessionFailed) return activity.sessionFailed.reason || activity.sessionFailed.message || 'Session failed';
  return activity.description || activity.id || '<activity>';
}

export function summarizeActivities(activities, { limit = 12 } = {}) {
  const sorted = sortActivities(activities);
  const tail = sorted.slice(Math.max(0, sorted.length - limit));
  return tail.map(activity => {
    const time = activity.createTime ? `${activity.createTime} ` : '';
    const originator = activity.originator ? `[${activity.originator}] ` : '';
    return `- ${time}${originator}${activityHeadline(activity)}`;
  }).join('\n');
}

export function resultSnapshot(session, activities) {
  const plan = latestPlan(activities);
  const message = latestAgentMessage(activities);
  const patch = latestPatch(activities);
  const bashOutputs = extractBashOutputs(activities).slice(-10).map(item => ({
    ...item,
    output: truncateText(item.output, 4000)
  }));
  return {
    session: pick(session, ['name', 'id', 'title', 'state', 'url', 'createTime', 'updateTime']),
    pullRequests: extractPullRequests(session),
    latestPlan: plan || null,
    finalAgentMessage: message || null,
    latestPatch: patch ? omit(patch, ['unidiffPatch']) : null,
    changedFiles: extractChangedFiles(activities),
    bashOutputs,
    activityCount: asArray(activities).length
  };
}

export function summarizeResult(session, activities) {
  const lines = [];
  lines.push(`# Jules session ${session?.name || session?.id || '<unknown>'}`);
  if (session?.title) lines.push(`Title: ${session.title}`);
  if (session?.state) lines.push(`State: ${session.state}`);
  if (session?.url) lines.push(`Session URL: ${session.url}`);

  const prs = extractPullRequests(session);
  if (prs.length) {
    lines.push('\n## Pull requests');
    for (const pr of prs) {
      lines.push(`- ${pr.title || 'PR'}: ${pr.url || '<missing-url>'}`);
      if (pr.description) lines.push(indent(pr.description, '  '));
    }
  }

  const plan = latestPlan(activities);
  if (plan) {
    lines.push('\n## Latest plan');
    lines.push(formatPlan(plan));
  }

  const finalMessage = latestAgentMessage(activities);
  if (finalMessage) {
    lines.push('\n## Final agent message');
    lines.push(finalMessage.text);
  }

  const patch = latestPatch(activities);
  if (patch) {
    lines.push('\n## Latest patch');
    lines.push(`Activity: ${patch.activityName || patch.activityId || '<unknown>'}`);
    if (patch.baseCommitId) lines.push(`Base commit: ${patch.baseCommitId}`);
    if (patch.suggestedCommitMessage) lines.push(`Suggested commit message:\n${patch.suggestedCommitMessage}`);
    lines.push(`Patch bytes: ${Buffer.byteLength(patch.unidiffPatch, 'utf8')}`);
  }

  const bashOutputs = extractBashOutputs(activities);
  if (bashOutputs.length) {
    lines.push('\n## Recent validation commands');
    lines.push(formatBashOutputs(bashOutputs.slice(-5), { outputLimit: 1200 }));
  }

  if (activities?.length) {
    lines.push('\n## Recent activity');
    lines.push(summarizeActivities(activities));
  }

  return lines.join('\n');
}

export function truncateText(value, maxChars) {
  const text = asText(value);
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 25))}\n...[truncated ${text.length - maxChars} chars]`;
}

function parseDiffGitHeader(line) {
  const raw = String(line || '').replace(/^diff --git\s+/, '');
  const tokens = [];
  let index = 0;
  while (index < raw.length && tokens.length < 2) {
    while (/\s/.test(raw[index] || '')) index += 1;
    if (raw[index] === '"') {
      let token = '"';
      index += 1;
      let escaped = false;
      while (index < raw.length) {
        const char = raw[index++];
        token += char;
        if (char === '"' && !escaped) break;
        escaped = char === '\\' && !escaped;
        if (char !== '\\') escaped = false;
      }
      try {
        tokens.push(JSON.parse(token));
      } catch {
        tokens.push(token.slice(1, -1));
      }
    } else {
      const start = index;
      while (index < raw.length && !/\s/.test(raw[index])) index += 1;
      tokens.push(raw.slice(start, index));
    }
  }
  return [tokens[0] || '', tokens[1] || ''];
}

function normalizePatchPath(value, prefix) {
  const token = String(value || '').split('\t', 1)[0].trim();
  if (token === '/dev/null') return token;
  let decoded = token;
  if (decoded.startsWith('"') && decoded.endsWith('"')) {
    try { decoded = JSON.parse(decoded); } catch { decoded = decoded.slice(1, -1); }
  }
  return stripGitPrefix(decoded, prefix);
}

function stripGitPrefix(value, prefix) {
  const text = String(value || '');
  if (text === '/dev/null') return text;
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}

function normalizeComparablePath(value) {
  return String(value || '').trim().replace(/^\/+/, '').replace(/^(?:a|b)\//, '');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function indent(text, prefix) {
  return String(text).split('\n').map(line => `${prefix}${line}`).join('\n');
}

function pick(value, keys) {
  const out = {};
  for (const key of keys) if (value?.[key] !== undefined) out[key] = value[key];
  return out;
}

function omit(value, keys) {
  const out = { ...(value || {}) };
  for (const key of keys) delete out[key];
  return out;
}
