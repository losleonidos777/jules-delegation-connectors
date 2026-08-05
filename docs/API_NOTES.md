# Jules API and MCP notes

Validated against the public Jules API documentation and changelog available on 2026-08-05.

## Jules REST

- Base URL: `https://jules.googleapis.com/v1alpha`.
- Authentication: `X-Goog-Api-Key`.
- Sources are read-only through the API. Connect repositories in the Jules web app first.
- `sourceContext` is optional for repoless sessions.
- `AUTO_CREATE_PR` is repository-only and remains opt-in.
- Activities are immutable event records. The January 26 changelog documents `createTime=<RFC3339>` as a range cursor, while the generated method page lists only pagination; the connector sends the official cursor and defensively filters strictly newer values locally.
- Session deletion is available at `DELETE /sessions/{session}`; the CLI requires `--yes`.
- A single activity is available at `/sessions/{session}/activities/{activity}`.
- Current observed/documented fields include:
  - `activity.agentMessaged.agentMessage`
  - `activity.userMessaged.userMessage`
  - `activity.sessionFailed.reason`
  - `artifact.changeSet.gitPatch.unidiffPatch`
  - `artifact.bashOutput.{command,output,exitCode}`
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
