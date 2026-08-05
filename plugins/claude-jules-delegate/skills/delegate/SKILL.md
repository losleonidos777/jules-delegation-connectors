---
description: Delegate scoped GitHub implementation or no-edit review request tasks to Google Jules through the local jules-delegate CLI or Jules MCP server. Use when the user asks Claude Code to create, inspect, monitor, approve, message, review, or retrieve results from a Jules session. Do not use for ambiguous tasks, uncontrolled broad rewrites, or prompts containing secrets.
argument-hint: [repo/branch/task]
allowed-tools: Bash Read Write
---

# Jules Delegate

Use Jules asynchronously while Claude remains responsible for task scoping, human approvals, repository validation, and final review.

## Preflight

```bash
jules-delegate doctor --repo owner/repo
```

Or call `jules_list_sources`. The repository must be connected to the current Jules account. Claude Code Desktop users should configure `JULES_API_KEY` in the Local environment editor rather than relying on shell inheritance.

## Implementation workflow

1. Prepare a prompt with repo, base branch, goal, scope, constraints, acceptance criteria, validation commands, out-of-scope, and PR policy.
2. Create the session with plan approval enabled and auto-PR disabled unless explicitly authorized.
3. Stop at plan approval and show the full plan to the user.
4. Call approval only after explicit human consent.
5. Stop at user feedback, failure, pause, or completion.
6. Retrieve compact result, validation output, and patch separately.
7. Review and test the result locally before saying it is ready.

## Review-only workflow

```bash
jules-delegate review --repo owner/repo --branch main
```

The built-in prompt prohibits edits, commits, branches, and PRs. Return severity-ranked findings with file evidence and a release-readiness assessment.

## Guardrails

- Never send secrets or customer data.
- Never merge automatically.
- Never claim validation passed without command evidence.
- Do not request an unbounded patch or full activity feed when a compact tool exists.

## Context-efficient artifact review

1. Call `jules_get_result`.
2. Call `jules_list_changed_files`.
3. Call `jules_get_file_diff` for focused files.
4. Use `jules_get_patch` only when the whole capped patch is necessary.
5. Use `jules_get_bash_outputs` for validation evidence.
