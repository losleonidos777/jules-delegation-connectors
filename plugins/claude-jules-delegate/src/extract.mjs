export const WAITING_STATES = new Set(['AWAITING_PLAN_APPROVAL', 'AWAITING_USER_FEEDBACK']);
export const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'PAUSED']);
export const STOP_STATES = new Set([...WAITING_STATES, ...TERMINAL_STATES]);

export function sortActivities(activities) {
  return [...(activities || [])].sort((a, b) => String(a.createTime || '').localeCompare(String(b.createTime || '')));
}

export function latestPlan(activities) {
  return sortActivities(activities).filter(a => a.planGenerated?.plan).at(-1)?.planGenerated?.plan;
}

export function formatPlan(plan) {
  if (!plan) return 'No planGenerated activity found.';
  const lines = [`Plan ${plan.id || ''}`.trim()];
  asArray(plan.steps).forEach((rawStep, i) => {
    const step = rawStep || {};
    const index = step.index ?? i;
    const prefix = `${Number(index) + 1}.`;
    lines.push(`${prefix} ${step.title || step.description || step.id || '<untitled step>'}`);
    if (step.description && step.title && step.description !== step.title) lines.push(`   ${step.description}`);
  });
  return lines.join('\n');
}

function agentMessageText(activity) {
  const a = activity?.agentMessaged;
  if (!a) return '';
  return asText(a.agentMessage || a.message || a.text);
}

export function latestAgentMessage(activities) {
  for (const activity of sortActivities(activities).reverse()) {
    const text = agentMessageText(activity);
    if (text) return { text, createTime: activity.createTime, id: activity.id };
  }
  return null;
}

export function extractPatches(activities) {
  const patches = [];
  for (const activity of sortActivities(activities)) {
    for (const artifact of asArray(activity.artifacts)) {
      const gitPatch = artifact.changeSet?.gitPatch;
      if (!gitPatch) continue;
      const patch = gitPatch.unidiffPatch;
      if (typeof patch !== 'string' || !patch) continue;
      patches.push({
        activityId: activity.id,
        activityName: activity.name,
        createTime: activity.createTime,
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

export function extractPullRequests(session) {
  return asArray(session?.outputs)
    .map(output => output.pullRequest)
    .filter(Boolean);
}

export function activityHeadline(activity) {
  if (activity.planGenerated) return 'Plan generated';
  if (activity.planApproved) return 'Plan approved';
  if (activity.userMessaged) return 'User message';
  if (activity.agentMessaged) return agentMessageText(activity) || 'Agent message';
  if (activity.progressUpdated) return activity.progressUpdated.title || activity.progressUpdated.description || 'Progress update';
  if (activity.sessionCompleted) return 'Session completed';
  if (activity.sessionFailed) return activity.sessionFailed.message || 'Session failed';
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return typeof value === 'string' ? value : '';
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
      if (pr.description) lines.push(`  ${pr.description.replace(/\n/g, '\n  ')}`);
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

  if (activities?.length) {
    lines.push('\n## Recent activity');
    lines.push(summarizeActivities(activities));
  }

  return lines.join('\n');
}
