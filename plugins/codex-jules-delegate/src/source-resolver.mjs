import { UserInputError } from './errors.mjs';

export function normalizeRepo(repo) {
  if (!repo) return undefined;
  const trimmed = String(repo).trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length !== 2) throw new UserInputError(`Repository must be in owner/repo form; got: ${repo}`);
  return `${parts[0]}/${parts[1]}`;
}

export function sourceRepo(source) {
  const repo = source?.githubRepo;
  if (!repo?.owner || !repo?.repo) return undefined;
  return `${repo.owner}/${repo.repo}`;
}

export function sourceLabel(source) {
  return sourceRepo(source) || source?.id || source?.name || '<unknown-source>';
}

export function sourceMatches(source, selector) {
  if (!source || !selector) return false;
  const s = String(selector).trim();
  if (source.name === s || source.id === s) return true;
  return sourceRepo(source)?.toLowerCase() === s.toLowerCase();
}

export function findSource(sources, selector) {
  if (!selector) return undefined;
  return sources.find(source => sourceMatches(source, selector));
}

export async function resolveSource(api, { repo, source }) {
  if (source && String(source).startsWith('sources/')) return { name: source, source: undefined, allSources: undefined };

  const selector = source || repo;
  if (!selector) throw new UserInputError('Provide --repo owner/repo or --source sources/...');

  const sources = await api.listSources();
  const found = findSource(sources, selector);
  if (!found) {
    const available = sources.map(sourceLabel).sort().join('\n  - ');
    throw new UserInputError(
      `No Jules source matched "${selector}". Connect the repository in the Jules web app first, then run sources.\n` +
      (available ? `Available sources:\n  - ${available}` : 'No connected sources were returned by the API.')
    );
  }
  return { name: found.name, source: found, allSources: sources };
}

export function branchNames(source) {
  return (source?.githubRepo?.branches || [])
    .map(branch => branch?.displayName)
    .filter(Boolean);
}

export function defaultBranch(source) {
  return source?.githubRepo?.defaultBranch?.displayName || 'main';
}

export function assertBranchAllowed(source, branch, { skipBranchCheck = false } = {}) {
  if (skipBranchCheck || !source || !branch) return;
  const branches = branchNames(source);
  if (!branches.length) return;
  if (!branches.includes(branch)) {
    throw new UserInputError(`Branch "${branch}" was not listed for ${sourceLabel(source)}. Known branches: ${branches.join(', ')}. Use --skip-branch-check if the list is stale.`);
  }
}
