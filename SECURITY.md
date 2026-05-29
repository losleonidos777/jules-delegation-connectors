# Security policy

## Reporting a vulnerability

If you find a vulnerability in this connector — credential leakage in logs, an
auth bypass, a prompt-injection vector that defeats the plan-approval gate,
anything that lets a Jules session escape its scope — please **do not** open a
public issue.

Email the maintainers (see commit history for current contacts) with:

- Affected version (`package.json` `version`).
- Reproduction steps.
- Impact assessment.
- Suggested fix if you have one.

Expect an acknowledgement within 5 business days.

## Threat model and scope

This connector is the orchestration glue between a local agent (Claude Code or
Codex) and the Google Jules REST API. It does **not** itself run untrusted code,
clone repositories, or apply patches. It produces unidiff text and PR URLs that
your local tooling can act on.

In scope:

- Credential handling for `JULES_API_KEY` and `JULES_API_BASE_URL`.
- Local state hygiene in `.jules-orchestrator/` (sessions, prompts, patches).
- Prompt-checklist guardrail, branch validation, plan-approval gate.
- Redaction of secrets in error output and persisted prompts/logs.
- MCP `tools/call` error contract (`result.isError` vs JSON-RPC error).

Out of scope:

- Vulnerabilities in Google Jules itself.
- Vulnerabilities in Claude Code, Codex, or other MCP clients.
- Vulnerabilities in the GitHub repositories you delegate work against.

## Operator responsibilities

1. **Do not put secrets in Jules prompts, task templates, or feedback messages.** The connector redacts secrets in best-effort fashion when *writing* local prompts/logs, but it cannot redact what is *sent* to Google — once a value is in the `prompt` field, it leaves your machine.
2. **Treat `JULES_API_KEY` like a GitHub token.** Inject via environment variable. Never commit it to a repo. The connector accepts the key only via `process.env.JULES_API_KEY` and never logs it.
3. **Keep `requirePlanApproval: true` and `AUTO_CREATE_PR: false` as defaults.** Both are configurable per call. Auto-approving plans or auto-creating PRs from automated triggers (cron, webhooks, CI) defeats the human review gate and is not a supported configuration.
4. **Review Jules' produced patches and PRs before merging.** The connector surfaces them; it does not vouch for them.
5. **Connect repositories to Jules only through the Jules web app or GitHub App.** The API can read sources but cannot create them, by design.

## Known limitations

- The Jules REST API is documented as **alpha**. Field names may change without notice. All REST shape parsing is isolated in `src/jules-api.mjs`; if Google ships a breaking change, expect the version this connector pins against to surface clear errors rather than silent corruption.
- `LocalState` writes session metadata, prompts, and patches under `.jules-orchestrator/` in plaintext. If your task prompts are sensitive, set `JULES_STATE_DIR` to a path on encrypted storage.
