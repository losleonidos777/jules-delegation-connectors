# Jules API notes used by this connector

- Base URL: `https://jules.googleapis.com/v1alpha`.
- Auth: API key in `X-Goog-Api-Key`.
- `sources` represent connected GitHub repositories. The API can list and get sources, but does not create them. Connect repos in the Jules web app first.
- `sessions` represent coding tasks. This connector creates sessions with `sourceContext.source`, `sourceContext.githubRepoContext.startingBranch`, `prompt`, `title`, `requirePlanApproval`, and optional `automationMode: AUTO_CREATE_PR`.
- Plan approval flow: create with `requirePlanApproval: true`, poll until `AWAITING_PLAN_APPROVAL`, inspect `planGenerated`, then call `sessions/{id}:approvePlan` only after user approval.
- Feedback flow: call `sessions/{id}:sendMessage` with `{ "prompt": "..." }` when Jules needs clarification or the orchestrator wants to redirect.
- Activity feed is the canonical source for plans, progress updates, completion/failure events, and artifacts.
- Patch extraction reads `activity.artifacts[].changeSet.gitPatch.unidiffPatch`; PR extraction reads `session.outputs[].pullRequest`.
- Session states handled as stop states: `AWAITING_PLAN_APPROVAL`, `AWAITING_USER_FEEDBACK`, `PAUSED`, `COMPLETED`, `FAILED`.

## Real-API observations (verified 2026-05-25)

- Final agent text lives at `activity.agentMessaged.agentMessage` — **not** `.message` or `.text`. Older drafts of this file assumed `.message`; that key is empty in practice. Connector reads via `extract.mjs::latestAgentMessage`, which checks `agentMessage` first and falls back to `message`/`text` for defensive parsing.
- `sessions/{id}:approvePlan` and `sessions/{id}:sendMessage` return 200 before the session state transitions away from the awaiting state. There is short eventual consistency (observed up to ~5s) before `GET sessions/{id}` reflects `IN_PROGRESS`. The CLI's `approve`/`tell` commands therefore poll until the state changes (or 20s timeout) before returning so that a subsequent `watch` does not exit on stale state.
- `session.outputs[].pullRequest.description` returned by Jules already includes an auto-generated suffix (`PR created automatically by Jules for task ...`). Treat the description field as Jules-owned content.
- Branch lists in `source.githubRepo.branches[]` can include ad-hoc Jules working branches (`jules/...`, `codex/...`). Treat the source-side branch list as a hint, not ground truth — that is why `--skip-branch-check` exists.

## MCP semantics

- The `jules-mcp` server returns tool execution failures as `result.isError = true` with a text payload, per MCP spec. Reserve JSON-RPC `error` responses for protocol-level faults (invalid method, malformed JSON-RPC). MCP clients should branch on `result.isError`, not on a JSON-RPC error code, when surfacing tool failures.

Because Jules REST is alpha, keep all API shape changes isolated in `src/jules-api.mjs` and update tests/mocks when Google changes fields.
