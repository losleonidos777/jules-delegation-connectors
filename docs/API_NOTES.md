# Jules API and MCP notes

Validated against the public Jules API documentation and changelog available on 2026-08-05.

## Jules REST

- Base URL: `https://jules.googleapis.com/v1alpha`.
- Authentication: `X-Goog-Api-Key`.
- Sources are read-only through the API. Connect repositories in the Jules web app first.
- `sourceContext` is optional for repoless sessions.
- `AUTO_CREATE_PR` is repository-only and remains opt-in.
- Activities are immutable event records. `ListActivities` accepts `pageSize`, `pageToken`, and `filter`; a bare `createTime=<RFC3339>` query parameter is rejected with `400 INVALID_ARGUMENT: Unknown name "createTime": Cannot bind query parameter`. Verified live on 2026-08-06: the working range cursor is the AIP-160 filter `filter=create_time>"<RFC3339>"`. The connector sends that filter with millisecond precision and defensively re-applies the original sub-millisecond cursor locally.
- Session deletion is available at `DELETE /sessions/{session}`; the CLI requires `--yes`.
- A single activity is available at `/sessions/{session}/activities/{activity}`.
- Current observed/documented fields include:
  - `activity.agentMessaged.agentMessage` — observed only while a session waits for user feedback.
  - `activity.progressUpdated.{title,description}` — where a completed session actually carries the agent's narration and conclusion. `title` arrives server-truncated; `description` holds the full text. Many of these events are empty objects and carry no information.
  - `activity.userMessaged.userMessage`
  - `activity.sessionFailed.reason`
  - `artifact.changeSet.gitPatch.unidiffPatch` — repeated in full on nearly every subsequent activity, so patches are deduplicated by content before use.
  - `artifact.bashOutput.{command,output,exitCode}` — documented, but not observed in any live response as of 2026-08-06; `changeSet` was the only artifact type returned. The bash tools are kept for forward compatibility and report "No bashOutput artifacts found" until the API emits them.
- Reads retry transient network errors, 429, and common 5xx statuses. Writes are not automatically retried because duplicate session/message operations are unsafe.

## MCP

- Server supports protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`, and `2024-11-05`.
- If the client requests an unsupported version, the server returns its latest supported version.
- Standard stdio messages are newline-delimited UTF-8 JSON-RPC messages. The server writes no logs to stdout.
- Tool execution errors use `result.isError = true`; protocol errors use JSON-RPC error codes.
- Read-only and mutating tools advertise MCP annotations.
- Mutating tools include `_meta["anthropic/requiresUserInteraction"] = true`.
- Patch/result-heavy tools include `_meta["anthropic/maxResultSizeChars"]` and compact structured output.

## Client config distinction

- Claude/plugin JSON uses `mcpServers`.
- Codex plugin JSON uses `mcpServers`.
- Codex TOML uses `[mcp_servers.<id>]`.

Do not copy one syntax into another format.
