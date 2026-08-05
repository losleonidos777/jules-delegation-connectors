import { branchNames, sourceLabel } from './source-resolver.mjs';
import { activityHeadline, extractPullRequests, sortActivities } from './extract.mjs';

export function formatSources(sources) {
  if (!sources.length) return 'No Jules sources returned. Connect a GitHub repository in the Jules web app first.';
  const rows = sources.map(source => ({
    repo: sourceLabel(source),
    name: source.name || '',
    defaultBranch: source.githubRepo?.defaultBranch?.displayName || source.githubRepo?.defaultBranch?.name || '',
    private: source.githubRepo?.isPrivate === true ? 'private' : source.githubRepo?.isPrivate === false ? 'public' : '',
    branches: branchNames(source).slice(0, 8).join(', ')
  }));
  return formatTable(rows, ['repo', 'name', 'defaultBranch', 'private', 'branches']);
}

export function formatSessions(sessions) {
  if (!sessions.length) return 'No Jules sessions returned.';
  return formatTable(sessions.map(session => ({
    id: session.name || session.id,
    state: session.state || '',
    title: session.title || '',
    updated: session.updateTime || session.createTime || '',
    url: session.url || ''
  })), ['id', 'state', 'title', 'updated', 'url']);
}

export function formatSession(session) {
  const prs = extractPullRequests(session);
  const lines = [];
  lines.push(`Session: ${session.name || session.id || '<unknown>'}`);
  if (session.title) lines.push(`Title: ${session.title}`);
  if (session.state) lines.push(`State: ${session.state}`);
  if (session.url) lines.push(`URL: ${session.url}`);
  if (session.createTime) lines.push(`Created: ${session.createTime}`);
  if (session.updateTime) lines.push(`Updated: ${session.updateTime}`);
  if (prs.length) {
    lines.push('Pull requests:');
    for (const pr of prs) lines.push(`- ${pr.title || 'PR'} ${pr.url || ''}`.trim());
  }
  return lines.join('\n');
}

export function formatActivities(activities) {
  if (!activities.length) return 'No activities returned.';
  return sortActivities(activities).map(activity => {
    const time = activity.createTime ? `${activity.createTime} ` : '';
    const originator = activity.originator ? `[${activity.originator}] ` : '';
    return `${time}${originator}${activityHeadline(activity)}`;
  }).join('\n');
}

export function formatTable(rows, columns) {
  const widths = {};
  for (const col of columns) widths[col] = Math.max(col.length, ...rows.map(row => String(row[col] ?? '').length));
  const header = columns.map(col => pad(col, widths[col])).join('  ');
  const sep = columns.map(col => '-'.repeat(widths[col])).join('  ');
  const body = rows.map(row => columns.map(col => pad(String(row[col] ?? ''), widths[col])).join('  ')).join('\n');
  return `${header}\n${sep}\n${body}`;
}

function pad(text, width) {
  return text.length >= width ? text : `${text}${' '.repeat(width - text.length)}`;
}
