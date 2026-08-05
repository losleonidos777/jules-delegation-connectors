#!/usr/bin/env node
import { parseArgs, flagNumber, flagString } from '../src/args.mjs';
import { JulesApi, normalizeEnvValue, sessionName } from '../src/jules-api.mjs';
import { formatActivities, formatSession, formatSessions, formatSources } from '../src/format.mjs';
import { assertBranchAllowed, defaultBranch, findSource, inferRepoFromGit, normalizeRepo, resolveSource } from '../src/source-resolver.mjs';
import { LocalState } from '../src/state.mjs';
import { enforcePromptChecklist, reviewTaskTemplate, taskTemplate } from '../src/prompt-template.mjs';
import {
  extractBashOutputs,
  extractChangedFiles,
  extractPatches,
  findFileDiff,
  formatBashOutputs,
  formatChangedFiles,
  formatPlan,
  latestPatch,
  latestPlan,
  STOP_STATES,
  summarizeResult
} from '../src/extract.mjs';
import { formatError, UserInputError } from '../src/errors.mjs';
import { print, readTextFileOrStdin, writeJson } from '../src/io.mjs';
import { VERSION } from '../src/version.mjs';
import { inspectJulesCli } from '../src/system.mjs';

const USAGE = `jules-delegate ${VERSION}: delegate scoped GitHub coding tasks to Google Jules

Usage:
  jules-delegate --version
  jules-delegate doctor [--repo owner/repo] [--json]  # repo inferred from origin when omitted
  jules-delegate sources [--repo owner/repo] [--json]
  jules-delegate sessions [--page-size 30] [--json]
  jules-delegate create [--repo owner/repo | --source sources/... | --repoless] [--branch main] --title "..." --prompt-file task.md [--auto-pr] [--json]
  jules-delegate review [--repo owner/repo] [--branch main] [--require-plan] [--json]
  jules-delegate get <session-id> [--json]
  jules-delegate activities <session-id> [--since RFC3339] [--json]
  jules-delegate activity <session-id> <activity-id> [--json]
  jules-delegate watch <session-id> [--interval 5] [--max-polls 120] [--json]
  jules-delegate plan <session-id> [--json]
  jules-delegate approve <session-id>
  jules-delegate tell <session-id> --message-file feedback.md
  jules-delegate result <session-id> [--json]
  jules-delegate bash <session-id> [--output-limit 4000] [--json]
  jules-delegate files <session-id> [--json]
  jules-delegate diff <session-id> --file path/to/file [--output file.patch] [--json]
  jules-delegate patch <session-id> [--all] [--output jules.patch]
  jules-delegate delete <session-id> --yes
  jules-delegate template [--repo owner/repo] [--branch main] [--goal "..."]

Defaults:
  --require-plan is true for implementation sessions unless --no-require-plan is passed.
  review sends a no-edit/no-PR instruction and does not require plan approval unless --require-plan is passed; always inspect returned artifacts.
  Local state is stored in .jules-orchestrator unless JULES_STATE_DIR is set.
`;

async function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const command = positional[0];

  if (flags.version || command === 'version') {
    print(VERSION);
    return;
  }
  if (!command || flags.help || command === 'help' || command === '--help') {
    print(USAGE);
    return;
  }
  if (command === 'template') {
    print(taskTemplate({
      repo: flagString(flags, 'repo', 'owner/repo'),
      branch: flagString(flags, 'branch', 'main'),
      goal: flagString(flags, 'goal', 'Describe the precise coding task here.')
    }));
    return;
  }
  if (command === 'doctor') {
    await cmdDoctor(flags);
    return;
  }

  const api = new JulesApi();
  const state = new LocalState({ stateDir: flagString(flags, 'stateDir') || process.env.JULES_STATE_DIR });

  switch (command) {
    case 'sources':
      await cmdSources(api, flags);
      return;
    case 'sessions':
      await cmdSessions(api, flags);
      return;
    case 'create':
      await cmdCreate(api, state, flags);
      return;
    case 'review':
      await cmdReview(api, state, flags);
      return;
    case 'get':
      await cmdGet(api, flags, positional[1]);
      return;
    case 'activities':
      await cmdActivities(api, flags, positional[1]);
      return;
    case 'activity':
      await cmdActivity(api, flags, positional[1], positional[2]);
      return;
    case 'watch':
      await cmdWatch(api, state, flags, positional[1]);
      return;
    case 'plan':
      await cmdPlan(api, flags, positional[1]);
      return;
    case 'approve':
      await cmdApprove(api, positional[1]);
      return;
    case 'tell':
      await cmdTell(api, flags, positional[1]);
      return;
    case 'result':
      await cmdResult(api, flags, positional[1]);
      return;
    case 'bash':
      await cmdBash(api, flags, positional[1]);
      return;
    case 'files':
      await cmdFiles(api, flags, positional[1]);
      return;
    case 'diff':
      await cmdDiff(api, flags, positional[1]);
      return;
    case 'patch':
      await cmdPatch(api, state, flags, positional[1]);
      return;
    case 'delete':
      await cmdDelete(api, flags, positional[1]);
      return;
    default:
      throw new UserInputError(`Unknown command: ${command}\n\n${USAGE}`);
  }
}

async function cmdDoctor(flags) {
  const key = normalizeEnvValue(process.env.JULES_API_KEY);
  const baseUrl = normalizeEnvValue(process.env.JULES_API_BASE_URL) || 'https://jules.googleapis.com/v1alpha';
  const state = new LocalState({ stateDir: flagString(flags, 'stateDir') || process.env.JULES_STATE_DIR });
  const officialCli = await inspectJulesCli();
  const report = {
    ok: true,
    connectorVersion: VERSION,
    nodeVersion: process.versions.node,
    nodeSupported: Number(process.versions.node.split('.')[0]) >= 20,
    apiKeyConfigured: Boolean(key),
    apiBaseUrl: baseUrl,
    apiBaseUrlValid: true,
    stateDir: state.stateDir,
    stateWritable: false,
    apiReachable: false,
    connectedSourceCount: 0,
    officialCli
  };

  report.ok &&= report.nodeSupported;
  try {
    const url = new URL(baseUrl);
    report.apiBaseUrlValid = ['https:', 'http:'].includes(url.protocol);
  } catch {
    report.apiBaseUrlValid = false;
  }
  report.ok &&= report.apiBaseUrlValid;

  try {
    await state.ensure();
    report.stateWritable = true;
  } catch (error) {
    report.stateError = error.message;
  }
  report.ok &&= report.stateWritable;

  if (!key) {
    report.ok = false;
    report.apiError = 'JULES_API_KEY is not configured.';
  } else if (report.apiBaseUrlValid) {
    try {
      const api = new JulesApi({ apiKey: key, baseUrl });
      const sources = await api.listSources();
      report.apiReachable = true;
      report.connectedSourceCount = sources.length;
      const explicitRepo = flagString(flags, 'repo');
      const repo = explicitRepo || await inferRepoFromGit();
      if (repo) {
        const normalized = normalizeRepo(repo);
        const source = findSource(sources, normalized);
        report.requestedRepo = normalized;
        report.requestedRepoSource = explicitRepo ? 'argument' : 'git-origin';
        report.requestedRepoConnected = Boolean(source);
        if (source) report.requestedSource = source.name;
        report.ok &&= Boolean(source);
      }
    } catch (error) {
      report.apiError = formatError(error);
      report.ok = false;
    }
  }

  if (flags.json) writeJson(report);
  else {
    print(`connector: ${report.connectorVersion}`);
    print(`node: ${report.nodeVersion} (${report.nodeSupported ? 'ok' : 'requires Node 20+'})`);
    print(`api key: ${report.apiKeyConfigured ? 'configured' : 'missing'}`);
    print(`api base URL: ${report.apiBaseUrlValid ? 'valid' : 'invalid'} (${report.apiBaseUrl})`);
    print(`state directory: ${report.stateWritable ? 'writable' : 'not writable'} (${report.stateDir})`);
    print(`Jules API: ${report.apiReachable ? `reachable; ${report.connectedSourceCount} source(s)` : 'not verified'}`);
    print(`official Jules CLI: ${report.officialCli.available ? (report.officialCli.version || 'available') : 'not installed (optional)'}`);
    if (report.requestedRepo) print(`repo ${report.requestedRepo}: ${report.requestedRepoConnected ? 'connected' : 'not connected'}`);
    if (report.apiError) print(`diagnostic: ${report.apiError}`);
    print(report.ok ? 'doctor: PASS' : 'doctor: FAIL');
  }
  if (!report.ok) process.exitCode = 1;
}

async function cmdSources(api, flags) {
  const sources = await api.listSources();
  const repo = flagString(flags, 'repo');
  const filtered = repo ? sources.filter(source => findSource([source], normalizeRepo(repo))) : sources;
  if (flags.json) {
    writeJson(filtered);
    return;
  }
  if (repo && !filtered.length) {
    print(`No connected Jules source matched --repo ${repo}. ${sources.length} source(s) are connected. Run 'jules-delegate sources' without --repo to list them, or connect the repo via the Jules web app.`);
    return;
  }
  print(formatSources(filtered));
}

async function cmdSessions(api, flags) {
  const sessions = await api.listSessions({ pageSize: flagNumber(flags, 'pageSize', 30) });
  if (flags.json) writeJson(sessions);
  else print(formatSessions(sessions));
}

async function cmdCreate(api, state, flags) {
  let repo = flagString(flags, 'repo');
  const sourceSelector = flagString(flags, 'source');
  if (!repo && !sourceSelector && !flags.repoless) repo = await inferRepoFromGit();
  const title = flagString(flags, 'title');
  const promptFile = flagString(flags, 'promptFile');
  const inlinePrompt = flagString(flags, 'prompt');
  const prompt = inlinePrompt || await readTextFileOrStdin(promptFile);
  if (!prompt) throw new UserInputError('Provide --prompt "..." or --prompt-file task.md (use --prompt-file - for stdin).');

  const missing = enforcePromptChecklist(prompt);
  if (missing.length && !flags.skipPromptChecklist) {
    throw new UserInputError(`Prompt is missing required sections: ${missing.join(', ')}. Use templates/jules-task.md or pass --skip-prompt-checklist.`);
  }

  let sourceName;
  let source;
  let branch;
  if (flags.repoless) {
    if (repo || sourceSelector || flagString(flags, 'branch') || flags.autoPr) {
      throw new UserInputError('--repoless cannot be combined with --repo, --source, --branch, or --auto-pr.');
    }
  } else {
    ({ name: sourceName, source } = await resolveSource(api, { repo, source: sourceSelector }));
    branch = flagString(flags, 'branch', defaultBranch(source));
    assertBranchAllowed(source, branch, { skipBranchCheck: Boolean(flags.skipBranchCheck) });
  }

  const session = await api.createSession({
    prompt,
    title,
    source: sourceName,
    branch,
    requirePlanApproval: flags.requirePlan !== false,
    autoCreatePr: Boolean(flags.autoPr)
  });

  await state.upsertSession(session, {
    repo: repo || sourceSelector,
    branch,
    source: sourceName,
    repoless: Boolean(flags.repoless),
    autoCreatePr: Boolean(flags.autoPr)
  });
  if (flags.savePrompt !== false) await state.savePrompt(session.name || session.id, prompt);

  if (flags.json) writeJson(session);
  else {
    print(formatSession(session));
    print('');
    print('Next:');
    print(`  jules-delegate watch ${session.name || session.id}`);
    print(`  jules-delegate plan ${session.name || session.id}`);
  }
}

async function cmdReview(api, state, flags) {
  const repo = flagString(flags, 'repo') || await inferRepoFromGit();
  if (!repo) throw new UserInputError('Could not infer a GitHub repository from origin; pass --repo owner/repo.');
  const { name: sourceName, source } = await resolveSource(api, { repo });
  const branch = flagString(flags, 'branch', defaultBranch(source));
  assertBranchAllowed(source, branch, { skipBranchCheck: Boolean(flags.skipBranchCheck) });
  const prompt = reviewTaskTemplate({ repo: normalizeRepo(repo), branch });
  const session = await api.createSession({
    prompt,
    title: flagString(flags, 'title', `Repository review: ${normalizeRepo(repo)}`),
    source: sourceName,
    branch,
    requirePlanApproval: flags.requirePlan === true,
    autoCreatePr: false
  });
  await state.upsertSession(session, { repo: normalizeRepo(repo), branch, source: sourceName, reviewOnly: true, autoCreatePr: false });
  await state.savePrompt(session.name || session.id, prompt);
  if (flags.json) writeJson(session);
  else {
    print(formatSession(session));
    print('Review request guardrails: Jules was instructed not to edit, commit, create branches, or open a PR. Inspect returned artifacts before trusting that constraint.');
    print(`Next: jules-delegate watch ${session.name || session.id}`);
  }
}

async function cmdGet(api, flags, id) {
  requireSession(id);
  const session = await api.getSession(id);
  if (flags.json) writeJson(session);
  else print(formatSession(session));
}

async function cmdActivities(api, flags, id) {
  requireSession(id);
  const activities = await api.listActivities(id, {
    pageSize: flagNumber(flags, 'pageSize', 100),
    since: flagString(flags, 'since')
  });
  if (flags.json) writeJson(activities);
  else print(formatActivities(activities));
}

async function cmdActivity(api, flags, sessionId, activityId) {
  requireSession(sessionId);
  if (!activityId) throw new UserInputError('Activity id is required.');
  const activity = await api.getActivity(sessionId, activityId);
  if (flags.json) writeJson(activity);
  else writeJson(activity);
}

async function cmdWatch(api, state, flags, id) {
  requireSession(id);
  const interval = Math.max(1, flagNumber(flags, 'interval', 5));
  const maxPolls = Math.max(1, flagNumber(flags, 'maxPolls', 120));
  let lastState;
  let consecutiveErrors = 0;
  for (let i = 0; i < maxPolls; i += 1) {
    let session;
    try {
      session = await api.getSession(id);
      consecutiveErrors = 0;
    } catch (error) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 5) throw error;
      if (!flags.json) print(`${new Date().toISOString()} transient error: ${error.message || error}; retrying`);
      await sleep(interval * 1000);
      continue;
    }
    await state.upsertSession(session);
    if (flags.json) writeJson(session);
    else if (session.state !== lastState) print(`${new Date().toISOString()} ${session.name || session.id} ${session.state || '<unknown-state>'}`);
    lastState = session.state;

    if (session.state && STOP_STATES.has(session.state) && !flags.continueAfterAwaiting) {
      if (!flags.json) {
        if (session.state === 'AWAITING_PLAN_APPROVAL') print(`Plan approval needed: jules-delegate plan ${session.name || id} && jules-delegate approve ${session.name || id}`);
        if (session.state === 'AWAITING_USER_FEEDBACK') print(`Feedback needed: jules-delegate tell ${session.name || id} --message-file feedback.md`);
      }
      return;
    }
    await sleep(interval * 1000);
  }
  throw new Error(`Stopped after ${maxPolls} polls without reaching a stop state.`);
}

async function cmdPlan(api, flags, id) {
  requireSession(id);
  const activities = await api.listActivities(id, { pageSize: flagNumber(flags, 'pageSize', 100) });
  const plan = latestPlan(activities);
  if (flags.json) writeJson(plan || null);
  else print(formatPlan(plan));
}

async function cmdApprove(api, id) {
  requireSession(id);
  await api.approvePlan(id);
  print(`Approved latest plan for ${sessionName(id)}.`);
  await waitForStateChange(api, id, 'AWAITING_PLAN_APPROVAL');
}

async function cmdTell(api, flags, id) {
  requireSession(id);
  const messageFile = flagString(flags, 'messageFile');
  const inlineMessage = flagString(flags, 'message');
  const message = inlineMessage || await readTextFileOrStdin(messageFile);
  if (!message) throw new UserInputError('Provide --message "..." or --message-file feedback.md (use --message-file - for stdin).');
  await api.sendMessage(id, message);
  print(`Sent message to ${sessionName(id)}.`);
  await waitForStateChange(api, id, 'AWAITING_USER_FEEDBACK');
}

async function waitForStateChange(api, id, fromState, { timeoutMs = 20000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      const session = await api.getSession(id);
      if (session.state !== fromState) return session.state;
    } catch {
      // Ignore transient errors while waiting for eventual consistency.
    }
  }
  return null;
}

async function cmdResult(api, flags, id) {
  requireSession(id);
  const [session, activities] = await Promise.all([
    api.getSession(id),
    api.listActivities(id, { pageSize: flagNumber(flags, 'pageSize', 100) })
  ]);
  if (flags.json) writeJson({ session, activities });
  else print(summarizeResult(session, activities));
}

async function cmdBash(api, flags, id) {
  requireSession(id);
  const activities = await api.listActivities(id, { pageSize: flagNumber(flags, 'pageSize', 100) });
  const outputs = extractBashOutputs(activities);
  if (flags.json) writeJson(outputs);
  else print(formatBashOutputs(outputs, { outputLimit: flagNumber(flags, 'outputLimit', 4000) }));
}

async function cmdFiles(api, flags, id) {
  requireSession(id);
  const activities = await api.listActivities(id, { pageSize: flagNumber(flags, 'pageSize', 100) });
  const files = extractChangedFiles(activities);
  if (flags.json) writeJson(files);
  else print(formatChangedFiles(files));
}

async function cmdDiff(api, flags, id) {
  requireSession(id);
  const filePath = flagString(flags, 'file');
  if (!filePath) throw new UserInputError('Provide --file path/to/file for the exact repository-relative path.');
  const activities = await api.listActivities(id, { pageSize: flagNumber(flags, 'pageSize', 100) });
  const file = findFileDiff(activities, filePath);
  if (!file) throw new UserInputError(`No Jules diff found for ${filePath}. Run 'jules-delegate files ${sessionName(id)}' first.`);
  if (flags.json) {
    writeJson(file);
    return;
  }
  const output = flagString(flags, 'output');
  if (output) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(output, file.unidiffPatch, 'utf8');
    print(`Wrote ${Buffer.byteLength(file.unidiffPatch, 'utf8')} bytes to ${output}`);
    return;
  }
  process.stdout.write(file.unidiffPatch);
  if (!file.unidiffPatch.endsWith('\n')) process.stdout.write('\n');
}

async function cmdDelete(api, flags, id) {
  requireSession(id);
  if (flags.yes !== true) {
    throw new UserInputError('delete is destructive; pass --yes to confirm the exact session id');
  }
  await api.deleteSession(id);
  print(`Deleted ${sessionName(id)}.`);
}

async function cmdPatch(api, state, flags, id) {
  requireSession(id);
  const activities = await api.listActivities(id, { pageSize: flagNumber(flags, 'pageSize', 100) });
  const patches = extractPatches(activities);
  if (!patches.length) throw new UserInputError('No non-empty gitPatch.unidiffPatch artifacts found in activities.');
  const patchText = flags.all ? patches.map(patch => patch.unidiffPatch).join('\n') : latestPatch(activities).unidiffPatch;
  const output = flagString(flags, 'output');
  if (output) {
    const fs = await import('node:fs/promises');
    await fs.writeFile(output, patchText, 'utf8');
    print(`Wrote ${Buffer.byteLength(patchText, 'utf8')} bytes to ${output}`);
  } else if (flags.save) {
    const file = await state.savePatch(id, patchText);
    print(`Wrote ${Buffer.byteLength(patchText, 'utf8')} bytes to ${file}`);
  } else {
    process.stdout.write(patchText);
    if (!patchText.endsWith('\n')) process.stdout.write('\n');
  }
}

function requireSession(id) {
  if (!id) throw new UserInputError('Session id is required. Use sessions/123 or 123.');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exit(error instanceof UserInputError ? 2 : 1);
});
