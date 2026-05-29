# Jules Task

## Repo
owner/repo

## Base branch
main

## Goal
Fix the bug where login returns 500 when the user has no avatar.

## Scope
Only touch authentication/profile loading code and related tests.

## Constraints
- Do not change DB schema.
- Do not introduce new dependencies.
- Preserve existing public API behavior.
- Do not include secrets, credentials, tokens, or customer data in code, tests, logs, or comments.

## Acceptance criteria
- Login succeeds for users with and without avatar.
- Existing login tests still pass.
- Add regression test for missing avatar.

## Validation commands
npm test -- auth
npm run lint

## Out of scope
- UI redesign.
- Session/token model changes.
- Database migrations.

## PR policy
Generate a PR only if the orchestrator passed `--auto-pr` / `autoCreatePr: true`. Never merge.
