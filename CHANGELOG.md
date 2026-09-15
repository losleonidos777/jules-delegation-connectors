# Changelog

All notable changes to Jules Delegation Connectors are documented here. The project follows Semantic Versioning and Keep a Changelog conventions.

## [0.2.1] - 2026-08-06

Live-verified against the Jules API on 2026-08-06. Every item below was reproduced against real sessions before and after the fix.

### Fixed

- The activity cursor no longer fails. `since`/`--since` sent `createTime` as a query parameter, which the API rejects with `400 INVALID_ARGUMENT: Unknown name "createTime"`, so every incremental read failed and the local filter never ran. The connector now sends the AIP-160 filter `create_time>"<RFC3339>"` and keeps the local sub-millisecond filter as a backstop.
- The agent's conclusion is no longer dropped from results. Completed sessions carry narration in `progressUpdated.description`, not `agentMessaged`, so `## Final agent message` and `resultSnapshot.finalAgentMessage` were always empty for finished work. Both now read `progressUpdated`.
- Repeated patches are deduplicated by content. Jules attaches the whole cumulative patch to nearly every activity; `jules_get_patch --mode all` returned 271,959 characters for a single 9 KB documentation change.
- `jules_list_activities` no longer returns patch bodies. One documentation session produced a 305 KB response, above the tool's own declared 300 KB cap, 94% of it duplicated patch text. Patch bodies are replaced with `unidiffPatchChars`; use `jules_get_file_diff` or `jules_get_patch` for diffs.
- Empty `progressUpdated` events are filtered out of timelines. They accounted for 39 of 43 activities in one session and rendered as identical "Progress update" lines.
- `truncateText` respects its cap and reports the real drop count. A 1500-character request returned 1501 characters and understated the dropped size by the marker length.
- Unresolved environment placeholders are rejected in composed form. `JULES_STATE_DIR=${CLAUDE_PLUGIN_DATA}/state` passed validation and created a literal `${CLAUDE_PLUGIN_DATA}` directory; only a bare `${VAR}` was caught before.
- `structuredContent` is omitted instead of sent as `null` when a tool has no structured payload.

### Changed

- The `review` prompt no longer contradicts itself. A live review session was told "do not edit files" yet still wrote `jules_review_report.md`, so the instruction was unverifiable in practice. The template now permits exactly one added report file at a known path and requires a summary in the final message, which makes the constraint checkable: the diff must contain that file and nothing else.

### Documented

- `docs/API_NOTES.md` records the live-verified activity shapes: where agent narration actually lives, that patches repeat, and that `bashOutput` artifacts were not observed in any live response (only `changeSet`), so the bash tools stay forward-compatible rather than functional.

## [0.2.0] - 2026-08-05

### Fixed

- Corrected the Codex plugin `.mcp.json` root from `mcp_servers` to `mcpServers` and added an explicit working directory.
- Made Claude Code plugin environment expansion deterministic with defaults and persistent state under `CLAUDE_PLUGIN_DATA`; removed undocumented per-server `cwd`/`timeout` fields.
- Added validation for unresolved environment placeholders and invalid API base URLs.
- Updated MCP JSON-RPC errors (`-32700`, `-32600`, `-32601`, `-32602`) and protocol-version negotiation.
- Removed the hard-coded account-specific session id from the live MCP smoke test.
- Retained the official session-delete endpoint behind an explicit CLI `--yes` confirmation.
- Parsed official `sessionFailed.reason`, user messages, and `bashOutput` artifacts.
- Prevented unbounded full activity feeds and patches from being duplicated in `jules_get_result` structured output.

### Added

- Jules API support for repoless sessions and single-activity retrieval, plus the official `createTime` activity cursor with defensive local filtering after pagination.
- `jules_list_sessions`, `jules_get_activity`, `jules_get_bash_outputs`, `jules_list_changed_files`, and `jules_get_file_diff` MCP tools.
- MCP 2025-11-25 tool annotations and Claude-specific output/user-interaction metadata.
- `doctor`, `review`, `activity`, `bash`, `files`, and `diff` CLI commands; `doctor` also reports optional official Jules CLI availability.
- `scripts/live-review.mjs` and `npm run live:review` for a no-edit/no-PR repository review.
- Read-only GET retries, request timeouts, and configurable reliability environment variables.
- `scripts/sync-plugins.mjs`, `check:plugins`, and CI on Node 20, 22, and 24.
- Compatibility and best-practice review in `docs/REVIEW_2026-08.md`.

### Changed

- Version numbers are aligned at `0.2.0` across package, MCP server, Claude plugin, and Codex plugin.
- The prompt checklist is enforced by both CLI and MCP session creation.
- MCP stdio output follows the newline-delimited transport specified by MCP; non-standard Content-Length output framing was removed.
- Mutating MCP tools now explicitly require user interaction in Claude Code.

## [0.1.1] - 2026-05-25

### Fixed

- Added eventual-consistency waits after plan approval and feedback.
- Returned MCP tool failures as `result.isError = true`.
- Corrected final agent message and plan numbering extraction.
- Improved source filtering, state writes, redaction, malformed payload handling, and transient watch retries.

## [0.1.0] - 2026-05-24

### Added

- Initial zero-dependency Jules REST CLI and MCP stdio server.
- Claude Code and Codex skills/plugins, safe defaults, templates, and tests.

[0.2.1]: https://github.com/losleonidos777/jules-delegation-connectors/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/losleonidos777/jules-delegation-connectors/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/losleonidos777/jules-delegation-connectors/releases/tag/v0.1.1
[0.1.0]: https://github.com/losleonidos777/jules-delegation-connectors/releases/tag/v0.1.0
