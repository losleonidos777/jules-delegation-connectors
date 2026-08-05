# Jules Task

## Repo
owner/repo

## Base branch
main

## Goal
Describe one precise implementation outcome.

## Scope
- List the directories, files, modules, or behavior Jules may change.
- Keep the diff focused and avoid unrelated cleanup.

## Constraints
- Preserve public API behavior unless the acceptance criteria explicitly require a change.
- Do not add dependencies without approval.
- Do not access or request secrets, credentials, tokens, or private customer data.
- Follow repository instructions in AGENTS.md, CLAUDE.md, README, and contributing documentation.

## Acceptance criteria
- Add concrete pass/fail requirements.
- Add regression tests for bug fixes.
- Keep existing supported runtimes and clients working.

## Validation commands
- npm test
- npm run check

## Out of scope
- Architectural rewrites.
- Unrelated refactors or formatting sweeps.
- Database, infrastructure, or release changes unless explicitly requested.

## PR policy
Create a PR only if the orchestrator explicitly enabled auto-PR. Never merge.
