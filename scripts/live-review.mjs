#!/usr/bin/env node
import { JulesApi } from '../src/jules-api.mjs';
import { assertBranchAllowed, defaultBranch, normalizeRepo, resolveSource } from '../src/source-resolver.mjs';
import { LocalState } from '../src/state.mjs';
import { reviewTaskTemplate } from '../src/prompt-template.mjs';
import { formatError } from '../src/errors.mjs';

const repo = normalizeRepo(process.argv[2] || 'losleonidos777/jules-delegation-connectors');
const requestedBranch = process.argv[3];

async function main() {
  const api = new JulesApi();
  const state = new LocalState();
  const { name: sourceName, source } = await resolveSource(api, { repo });
  const branch = requestedBranch || defaultBranch(source);
  assertBranchAllowed(source, branch);
  const prompt = reviewTaskTemplate({ repo, branch });
  const session = await api.createSession({
    prompt,
    title: `Connector review: ${repo}`,
    source: sourceName,
    branch,
    requirePlanApproval: false,
    autoCreatePr: false
  });
  await state.upsertSession(session, { repo, branch, source: sourceName, reviewOnly: true, autoCreatePr: false });
  await state.savePrompt(session.name || session.id, prompt);
  process.stdout.write(`${JSON.stringify({
    session: session.name || session.id,
    state: session.state,
    url: session.url,
    repo,
    branch,
    reviewOnly: true,
    autoCreatePr: false
  }, null, 2)}\n`);
}

main().catch(error => {
  process.stderr.write(`${formatError(error)}\n`);
  process.exit(1);
});
