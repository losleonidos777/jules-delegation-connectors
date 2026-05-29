#!/usr/bin/env node
import { parseArgs, flagNumber, flagString } from '../src/args.mjs';
import { JulesApi, sessionName } from '../src/jules-api.mjs';
import { formatActivities, formatSession, formatSessions, formatSources } from '../src/format.mjs';
import { assertBranchAllowed, defaultBranch, resolveSource } from '../src/source-resolver.mjs';
import { LocalState } from '../src/state.mjs';
import { enforcePromptChecklist, taskTemplate } from '../src/prompt-template.mjs';
import { extractPatches, formatPlan, latestPatch, latestPlan, STOP_STATES, summarizeResult } from '../src/extract.mjs';
import { formatError, UserInputError } from '../src/errors.mjs';
import { print, readTextFileOrStdin, writeJson } from '../src/io.mjs';

const USAGE = `jules-delegate: delegate scoped GitHub coding tasks to Google Jules

Usage:
  jules-delegate sources [--repo owner/repo] [--json]
  jules-delegate sessions [--json]
  jules-delegate create --repo owner/repo --branch main --title "..." --prompt-file task.md [--auto-pr] [--json]
  jules-delegate get <session-id> [--json]
  jules-delegate activities <session-id> [--json]
  jules-delegate watch <session-id> [--interval 5] [--max-polls 120] [--json]
  jules-delegate plan <session-id> [--json]
  jules-delegate approve <session-id>
  jules-delegate tell <session-id> --message-file feedback.md
  jules-delegate result <session-id> [--json]
  jules-delegate patch <session-id> [--all] [--output jules.patch]
  jules-delegate template [--repo owner/repo] [--branch main] [--goal "..."]

Defaults:
  --require-plan is true unless --no-require-plan is passed.
  Local state is stored in .jules-orchestrator unless JULES_STATE_DIR is set.
`;

async function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const command = positional[0];
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
    case 'get':
      await cmdGet(api, flags, positional[1]);
      return;
    case 'activities':
      await cmdActivities(api, flags, positional[1]);
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
    case 'patch':
      await cmdPatch(api, state, flags, positional[1]);
      return;
    case 'delete':
      await cmdDelete(api, positional[1]);
      return;
    default:
      throw new UserInputError(`Unknown command: ${command}\n\n${USAGE}`);
  }
}

async function cmdSources(api, flags) {
  const sources = await api.listSources();
  const repo = flagString(flags, 'repo');
  const filtered = repo ? sources.filter(source => `${source.githubRepo?.owner}/${source.githubRepo?.repo}`.toLowerCase() === repo.toLowerCase()) : sources;
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
  const repo = flagString(flags, 'repo');
  const sourceSelector = flagString(flags, 'source');
  const title = flagString(flags, 'title');
  const promptFile = flagString(flags, 'promptFile');
  const inlinePrompt = flagString(flags, 'prompt');
  const prompt = inlinePrompt || await readTextFileOrStdin(promptFile);
  if (!prompt) throw new UserInputError('Provide --prompt "..." or --prompt-file task.md (use --prompt-file - for stdin).');

  const { name: sourceName, source } = await resolveSource(api, { repo, source: sourceSelector });
  const branch = flagString(flags, 'branch', defaultBranch(source));
  assertBranchAllowed(source, branch, { skipBranchCheck: Boolean(flags.skipBranchCheck) });

  const missing = enforcePromptChecklist(prompt);
  if (missing.length && !flags.skipPromptChecklist) {
    throw new UserInputError(`Prompt is missing recommended sections: ${missing.join(', ')}. Use templates/jules-task.md or pass --skip-prompt-checklist.`);
  }

  const session = await api.createSession({
    prompt,
    title,
    source: sourceName,
    branch,
    requirePlanApproval: flags.requirePlan !== false,
    autoCreatePr: Boolean(flags.autoPr)
  });

  await state.upsertSession(session, { repo: repo || sourceSelector, branch, source: sourceName, autoCreatePr: Boolean(flags.autoPr) });
  if (flags.savePrompt !== false) await state.savePrompt(session.name || session.id, prompt);

  if (flags.json) {
    writeJson(session);
  } else {
    print(formatSession(session));
    print('');
    print('Next:');
    print(`  jules-delegate watch ${session.name || session.id}`);
    print(`  jules-delegate plan ${session.name || session.id}`);
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
  const activities = await api.listActivities(id, { pageSize: flagNumber(flags, 'pageSize', 100) });
  if (flags.json) writeJson(activities);
  else print(formatActivities(activities));
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

// Jules has eventual consistency on state transitions after approve/sendMessage.
// Without this, a `watch` invocation immediately after will see stale state and exit.
async function waitForStateChange(api, id, fromState, { timeoutMs = 20000, intervalMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      const session = await api.getSession(id);
      if (session.state !== fromState) return session.state;
    } catch {
      // ignore transient errors
    }
  }
  return null;
}

async function cmdResult(api, flags, id) {
  requireSession(id);
  const [session, activities] = await Promise.all([api.getSession(id), api.listActivities(id, { pageSize: flagNumber(flags, 'pageSize', 100) })]);
  if (flags.json) writeJson({ session, activities });
  else print(summarizeResult(session, activities));
}

async function cmdPatch(api, state, flags, id) {
  requireSession(id);
  const activities = await api.listActivities(id, { pageSize: flagNumber(flags, 'pageSize', 100) });
  const patches = extractPatches(activities);
  if (!patches.length) throw new UserInputError('No non-empty gitPatch.unidiffPatch artifacts found in activities.');
  const patchText = flags.all ? patches.map(p => p.unidiffPatch).join('\n') : latestPatch(activities).unidiffPatch;
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

async function cmdDelete(api, id) {
  requireSession(id);
  await api.deleteSession(id);
  print(`Deleted ${sessionName(id)}.`);
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
