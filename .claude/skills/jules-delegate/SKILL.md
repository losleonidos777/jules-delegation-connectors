---
description: Delegate scoped GitHub coding tasks to Google Jules through the local jules-delegate CLI or jules MCP server. Use when the user asks Claude Code to assign work to Jules, create/monitor/approve a Jules session, fetch a Jules PR/patch/result, or orchestrate an async implementation task in a connected GitHub repo. Do not use for broad architectural rewrites, unscoped tasks, or prompts containing secrets.
argument-hint: [repo/branch/task]
allowed-tools: Bash Read Write
---

# Jules Delegate

Use Google Jules as an async coding implementer while Claude remains the orchestrator and review gate.

## Required safety defaults

- Verify the repository with `jules-delegate sources` before creating a session unless the user provides an exact `sources/...` name.
- Create sessions with plan approval required by default.
- Do not call `approve` until the user explicitly approves the displayed plan.
- Do not include secrets, tokens, credentials, or customer data in the prompt or feedback.
- Do not use `--auto-pr` unless the user explicitly asks for PR creation and the task is low risk.
- Stop and report back when Jules enters `AWAITING_PLAN_APPROVAL`, `AWAITING_USER_FEEDBACK`, `FAILED`, `PAUSED`, or `COMPLETED`.

## Task shape

Prepare a Jules prompt with these sections:

```markdown
# Jules Task

## Repo
owner/repo

## Base branch
main

## Goal
One precise implementation goal.

## Scope
Files, modules, or behaviors Jules may change.

## Constraints
Hard limits, dependencies, compatibility, security notes.

## Acceptance criteria
Concrete pass/fail requirements.

## Validation commands
Commands Jules should run.

## Out of scope
Explicit non-goals.

## PR policy
Generate a PR only if asked. Never merge.
```

## CLI workflow

1. Check connected sources:

```bash
node ./bin/jules-delegate.mjs sources
```

If the connector is installed globally, use `jules-delegate` instead of `node ./bin/jules-delegate.mjs`.

2. Write the prompt to `.jules-orchestrator/prompts/next-task.md` or another project-local file.

3. Create the session:

```bash
jules-delegate create --repo owner/repo --branch main --title "Short task title" --prompt-file .jules-orchestrator/prompts/next-task.md
```

4. Watch until Jules needs approval/feedback or finishes:

```bash
jules-delegate watch sessions/SESSION_ID
```

5. Show the latest plan:

```bash
jules-delegate plan sessions/SESSION_ID
```

6. If the user approves, continue:

```bash
jules-delegate approve sessions/SESSION_ID
```

7. If the user requests changes, send feedback:

```bash
jules-delegate tell sessions/SESSION_ID --message-file feedback.md
```

8. After completion, retrieve result and patch:

```bash
jules-delegate result sessions/SESSION_ID
jules-delegate patch sessions/SESSION_ID --output .jules-orchestrator/patches/SESSION_ID.patch
```

## Final response checklist

Return:

- Jules session URL and PR URL, if present.
- Current state.
- Plan summary or completion summary.
- Patch/diff summary and major touched areas.
- Validation commands Jules ran or should run locally.
- Manual review risks and next action.
