# Changelog

All notable changes to the Jules Delegation Connectors are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-05-25

### Fixed

- **CLI race condition after `approve` / `tell`.** `bin/jules-delegate.mjs::cmdApprove` and `cmdTell` now poll until the session state leaves the awaiting state (up to 20 s) before returning. Without this, a `watch` invoked immediately afterwards saw stale `AWAITING_*` state and exited early because Jules has short eventual consistency after `:approvePlan` / `:sendMessage` return 200.
- **MCP tool-call error contract.** `bin/jules-mcp.mjs` `tools/call` returns tool-execution failures as `result.isError = true` with a text payload, per the MCP spec. Previously they were surfaced as JSON-RPC error responses, which conflated transport faults with tool faults and broke client retry / visibility behaviour.
- **Final agent message field name.** `src/extract.mjs::latestAgentMessage` (new) reads the real Jules field `activity.agentMessaged.agentMessage`. `summarizeResult` now surfaces a `## Final agent message` section. The shipped code silently dropped the final agent text because it looked for `.message` / `.text`.
- **Plan step numbering.** `src/extract.mjs::formatPlan` falls back to the array index when `step.index` is missing on the first step, so plans render as `1. … 2. … 3. …` instead of `- … 2. … 3. …`.
- **Accurate empty-filter message.** `bin/jules-delegate.mjs::cmdSources` returns a `"no source matched --repo X (N connected)"` message when a `--repo` filter matches nothing. Previously it printed `"Connect a GitHub repository in the Jules web app first"` even though sources were connected.

### Added

- `scripts/smoke-mcp-toolcalls.mjs` — live MCP smoke that drives the stdio server end-to-end (`initialize` → `tools/list` → `tools/call` on `jules_list_sources` + `jules_get_session`, plus an error-path call asserting `result.isError === true`). Requires `JULES_API_KEY`.
- `npm run smoke:mcp:live` script wiring the live smoke.
- Three new offline tests locking in the field-name and numbering fixes (`test/extract.test.mjs`).
- `docs/API_NOTES.md` — new sections "Real-API observations" and "MCP semantics" capturing field names, eventual-consistency timing, PR-description suffixes, and the `isError` contract.

## [0.1.0] — 2026-05-24

### Added

- Zero-dependency Node 20+ CLI (`jules-delegate`) and MCP stdio server (`jules-mcp`) for Google Jules v1alpha.
- Source resolver mapping `owner/repo` → `sources/...`, with case-insensitive matching and a `--skip-branch-check` escape hatch.
- Plan-approval gate enforced by default; `AUTO_CREATE_PR` opt-in only.
- Prompt-checklist guardrail rejecting prompts missing required sections.
- Claude Code skill (`.claude/skills/jules-delegate/SKILL.md`) and shareable Claude Code plugin (`plugins/claude-jules-delegate/`).
- Codex skill (`.agents/skills/jules-delegate/SKILL.md`) and Codex plugin (`plugins/codex-jules-delegate/`).
- Examples: `examples/claude-project.mcp.json`, `examples/codex-config.toml`.
- Task template (`templates/jules-task.md`).
- Offline tests for plan extraction, patch extraction, REST payload shape, pagination, and source resolution.

[0.1.1]: https://github.com/losleonidos777/jules-delegation-connectors/releases/tag/v0.1.1
[0.1.0]: https://github.com/losleonidos777/jules-delegation-connectors/releases/tag/v0.1.0
