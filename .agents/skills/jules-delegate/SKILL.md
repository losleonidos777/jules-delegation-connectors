---
name: jules-delegate
description: delegate scoped github coding tasks from codex to google jules through the local jules-delegate cli or jules mcp server. use when the user asks to assign work to jules, create/monitor/approve a jules session, fetch a jules pr/patch/result, or coordinate async implementation in a connected github repo. do not use for broad rewrites, ambiguous tasks, or prompts containing secrets.
---

# Jules Delegate

Use Google Jules as an asynchronous coding implementer. Codex remains responsible for scoping, approval, and review.

## Guardrails

- Run `jules-delegate sources` or call `jules_list_sources` before creating a session unless an exact `sources/...` name is provided.
- Require plan approval by default.
- Never call `jules_approve_plan` without explicit human approval of the displayed plan.
- Never include secrets, tokens, credentials, or private customer data in Jules prompts or feedback.
- Use `autoCreatePr` / `--auto-pr` only when explicitly requested.
- Stop and report back at `AWAITING_PLAN_APPROVAL`, `AWAITING_USER_FEEDBACK`, `FAILED`, `PAUSED`, or `COMPLETED`.

## Prompt contract

Always send Jules a prompt with:

- repo and base branch
- goal
- scope
- constraints
- acceptance criteria
- validation commands
- out-of-scope
- PR policy

Use `templates/jules-task.md` if available.

## CLI workflow

```bash
jules-delegate sources
jules-delegate create --repo owner/repo --branch main --title "Short title" --prompt-file task.md
jules-delegate watch sessions/SESSION_ID
jules-delegate plan sessions/SESSION_ID
jules-delegate approve sessions/SESSION_ID
jules-delegate result sessions/SESSION_ID
jules-delegate patch sessions/SESSION_ID --output jules.patch
```

Prefer MCP tools when available:

1. `jules_list_sources`
2. `jules_create_session`
3. `jules_get_plan`
4. `jules_approve_plan` only after approval
5. `jules_get_result`
6. `jules_get_patch`

## Response format

Summarize session state, session/PR URL, plan or completion status, patch highlights, validation commands, and manual review risks. Never claim the PR is merged.
