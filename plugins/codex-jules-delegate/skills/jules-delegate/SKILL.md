---
name: jules-delegate
description: Delegate scoped GitHub implementation or no-edit review request tasks from Codex to Google Jules through the local jules-delegate CLI or Jules MCP server. Use when the user asks to create, inspect, monitor, approve, message, review, or retrieve results from a Jules session. Do not use for ambiguous work, uncontrolled broad rewrites, or prompts containing secrets.
---

# Jules Delegate

Use Jules as an asynchronous implementer or reviewer while Codex remains the orchestrator and review gate.

## Preflight

- Run `jules-delegate doctor --repo owner/repo` or call `jules_list_sources`.
- Confirm the repository is connected and the branch is correct.
- Never put API keys, tokens, credentials, or private data in prompts or feedback.

## Implementation workflow

1. Build a structured prompt from `templates/jules-task.md`.
2. Call `jules_create_session` with `requirePlanApproval: true` and `autoCreatePr: false` unless explicitly authorized otherwise.
3. Monitor state with `jules_get_session` and fetch the latest plan with `jules_get_plan`.
4. Do not call `jules_approve_plan` until the human explicitly approves the displayed plan.
5. Stop at `AWAITING_USER_FEEDBACK`, `FAILED`, `PAUSED`, or `COMPLETED`.
6. Fetch `jules_get_result`, `jules_get_bash_outputs`, and `jules_get_patch` separately.
7. Review and validate locally. Never claim a PR is merged.

## Review-only workflow

Prefer the CLI command:

```bash
jules-delegate review --repo owner/repo --branch main
```

It creates a no-edit/no-commit/no-PR review task. Return the session URL, current state, severity-ranked findings, evidence, and remaining manual checks.

## Response format

Summarize the session id/URL, state, plan or review findings, PR URL if any, validation commands and outcomes, patch highlights, risks, and the next human decision.

## Context-efficient artifact review

1. Call `jules_get_result`.
2. Call `jules_list_changed_files`.
3. Call `jules_get_file_diff` for focused files.
4. Use `jules_get_patch` only when the whole capped patch is necessary.
5. Use `jules_get_bash_outputs` for validation evidence.
