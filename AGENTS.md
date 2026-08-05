# Jules delegation policy for coding agents

Use Jules as a scoped asynchronous implementer or reviewer. The local agent remains responsible for repository inspection, task design, human approvals, validation, and final review.

## Before delegating

1. Run `jules-delegate doctor --repo owner/repo` or call `jules_list_sources`.
2. Confirm the exact repository, base branch, allowed scope, acceptance criteria, validation commands, and PR policy.
3. Exclude secrets, credentials, private customer data, and unrelated files.
4. Prefer small or medium tasks with objective pass/fail criteria.

## Safe implementation flow

1. Create a structured prompt using `templates/jules-task.md`.
2. Create the session with plan approval enabled.
3. Stop at `AWAITING_PLAN_APPROVAL` and show the plan to the human.
4. Approve only after explicit human authorization.
5. Stop at `AWAITING_USER_FEEDBACK`, `FAILED`, `PAUSED`, or `COMPLETED`.
6. Retrieve the compact result, validation output, and patch separately.
7. Review and test locally before accepting or merging any PR.

## No-edit review request flow

Use `jules-delegate review --repo owner/repo --branch main` for a code/documentation review. The review prompt requests no edits, commits, branches, or PRs. Treat this as an instruction rather than a hard sandbox and inspect all returned artifacts.

## Guardrails

- Never enable auto-PR unless explicitly requested.
- Never merge a Jules PR automatically.
- Never send secrets in prompts or feedback.
- Never claim validation passed without command evidence.
- Never treat a completed Jules session as equivalent to merged or production-ready code.
