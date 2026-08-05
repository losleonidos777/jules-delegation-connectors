# Jules Delegation Connectors

Portable, zero-runtime-dependency tooling that lets Claude Code or Codex stay in charge of scoping, approvals, and review while Google Jules executes asynchronous coding tasks.

The repository contains:

- `jules-delegate`: Node.js CLI for the Jules REST API.
- `jules-mcp`: newline-delimited MCP stdio server for Claude Code, Codex, Cursor, and compatible clients.
- Self-contained Claude Code and Codex plugins.
- A strict task template, live review helper, diagnostics, tests, and plugin synchronization checks.

## What changed in 0.2.0

- Fixed the Codex plugin manifest shape: plugin `.mcp.json` now uses `mcpServers`; Codex TOML continues to use `[mcp_servers.*]`.
- Made Claude Code setup deterministic with documented environment-variable defaults and persistent plugin state, while keeping plugin MCP JSON to the documented stdio fields.
- Added `doctor` diagnostics for Node, key configuration, API reachability, local state, repository connectivity, and optional official Jules CLI discovery.
- Added safe no-edit repository review request sessions with `review` and `npm run live:review`.
- Added current Jules API features: repoless sessions, single-activity reads, `bashOutput` extraction, and the official `createTime` activity range cursor with defensive local filtering.
- Updated MCP lifecycle/version negotiation for protocol 2025-11-25 while retaining common older protocol versions.
- Added tool annotations, explicit user-interaction metadata for mutating tools, and compact result payloads to reduce context pressure.
- Removed the account-specific session ID from the live smoke test.
- Added retry/timeout handling for idempotent REST reads, CI on Node 20/22/24, and automated root-to-plugin source synchronization.

See `docs/REVIEW_2026-08.md` for the compatibility review and design decisions.

## Requirements

- Node.js 20 or later.
- A Jules API key in `JULES_API_KEY`.
- For repository-backed sessions, the target GitHub repository must already be connected through the Jules web app. The API can read sources but cannot create them.

A public GitHub URL alone is not enough: Jules must see the repository as a connected source for your account.

## Install and preflight

```bash
npm install
export JULES_API_KEY="..."
node ./bin/jules-delegate.mjs doctor --repo owner/repo
```

`doctor` never prints the key. It checks the effective API URL, state directory, API reachability, and whether the requested repository is connected.

## CLI workflow

```bash
# Inspect connected sources and recent sessions.
jules-delegate sources
jules-delegate sessions

# Create a safe implementation session that stops for plan approval.
jules-delegate create \
  --repo owner/repo \
  --branch main \
  --title "Fix login without avatar" \
  --prompt-file templates/jules-task.md

jules-delegate watch sessions/123456
jules-delegate plan sessions/123456
jules-delegate approve sessions/123456
jules-delegate result sessions/123456
jules-delegate bash sessions/123456
jules-delegate files sessions/123456
jules-delegate diff sessions/123456 --file src/example.mjs
jules-delegate patch sessions/123456 --output jules.patch
# Session deletion is destructive and requires explicit confirmation.
jules-delegate delete sessions/123456 --yes
```

When `--repo` is omitted in a local CLI command, the connector attempts to infer the GitHub repository from `remote.origin.url`. Plan approval is on by default. `--no-require-plan` is an explicit opt-out; `--auto-pr` is also explicit and repository-only.

### No-edit repository review request

```bash
jules-delegate review --repo losleonidos777/jules-delegation-connectors --branch main
```

The built-in review prompt instructs Jules not to edit, commit, create branches, or create a PR; still inspect returned artifacts because prompt constraints are not a hard sandbox. It asks for severity-ranked findings, concrete file evidence, integration root causes, missing tests, and a release-readiness assessment.

The same flow is available as a direct live helper:

```bash
JULES_API_KEY="..." npm run live:review -- losleonidos777/jules-delegation-connectors main
```

The command prints the session id and web URL. Continue with `jules-delegate watch` and `jules-delegate result`.

### Repoless sessions

```bash
jules-delegate create --repoless --title "Prototype parser" --prompt-file task.md
```

Repoless sessions omit `sourceContext`; they cannot use `--branch` or `--auto-pr`.

### Incremental activities and validation output

```bash
jules-delegate activities sessions/123 --since 2026-08-05T00:00:00Z
jules-delegate activity sessions/123 activity-id --json
jules-delegate bash sessions/123
```

Jules activities are immutable. Persist the latest `createTime` and pass it back as `--since`; the connector sends the official range cursor, paginates the response, and defensively filters strictly newer events locally.

## Claude Code Desktop

The desktop app may not inherit arbitrary variables exported by your shell, especially when launched from the macOS Dock or Finder. For Local sessions:

1. Open the environment selector in the prompt box.
2. Hover over **Local** and click the gear icon.
3. Add `JULES_API_KEY` in the local environment editor.
4. Restart or reload the plugin, then run `/mcp`.

The plugin uses:

```json
{
  "mcpServers": {
    "jules": {
      "type": "stdio",
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/bin/jules-mcp.mjs"],
      "env": {
        "JULES_API_KEY": "${JULES_API_KEY:-}",
        "JULES_API_BASE_URL": "${JULES_API_BASE_URL:-https://jules.googleapis.com/v1alpha}",
        "JULES_STATE_DIR": "${CLAUDE_PLUGIN_DATA}/state"
      }
    }
  }
}
```

An empty/missing key now reaches the connector as an empty value and produces a clear diagnostic instead of an ambiguous config expansion failure. Set Claude Code startup timing with its documented `MCP_TIMEOUT` environment variable rather than an undocumented per-server JSON field.

### Standalone Claude Code skill

```bash
mkdir -p .claude/skills
cp -R /absolute/path/to/jules-delegation-connectors/.claude/skills/jules-delegate .claude/skills/
```

Invoke `/jules-delegate` explicitly or install the plugin:

```bash
claude --plugin-dir ./plugins/claude-jules-delegate
```

Inside Claude Code, use `/reload-plugins`, `/mcp`, and `/jules-delegate:delegate`.

## Codex

There are two distinct config syntaxes:

- Plugin `.mcp.json`: JSON root key is `mcpServers`.
- User/project `config.toml`: tables are `[mcp_servers.<id>]`.

The 0.1 plugin incorrectly used the TOML-style name inside JSON. Version 0.2 fixes that and sets `cwd` explicitly.

### Standalone Codex configuration

```bash
codex mcp add jules --env JULES_API_KEY="$JULES_API_KEY" -- node /absolute/path/to/jules-delegation-connectors/bin/jules-mcp.mjs
```

Or copy `examples/codex-config.toml` to `.codex/config.toml` or `~/.codex/config.toml`, adjust paths, and trust the project. The example auto-approves read-only tools and prompts for session creation, plan approval, and feedback.

### Codex plugin

The self-contained plugin lives in `plugins/codex-jules-delegate`. Its `.codex-plugin/plugin.json` points to `./.mcp.json`, and the MCP manifest uses the current plugin JSON shape.

After installing, verify all layers rather than relying only on the settings card:

```text
codex mcp list
codex mcp get jules
/mcp
```

Some Codex Desktop releases have had UI/runtime mismatches where a configured server appears in settings but its tools are not injected into a thread. The commands above distinguish configuration, initialization, discovery, and thread exposure.

## MCP tools

Read-only:

- `jules_list_sources`
- `jules_list_sessions`
- `jules_get_session`
- `jules_list_activities`
- `jules_get_activity`
- `jules_get_plan`
- `jules_get_result`
- `jules_list_changed_files`
- `jules_get_file_diff`
- `jules_get_patch`
- `jules_get_bash_outputs`

Mutating and marked for explicit user interaction:

- `jules_create_session`
- `jules_approve_plan`
- `jules_send_message`

`jules_get_result` returns a compact structured snapshot instead of duplicating every raw activity and the full patch. Prefer `jules_list_changed_files` followed by `jules_get_file_diff` during review; `jules_get_patch` remains available for capped whole-patch retrieval, while the CLI can export an unbounded patch file.

## Official Jules CLI interoperability

Google now ships `@google/jules` with commands such as `jules remote new`, `jules remote list`, `jules remote pull`, and `jules teleport`. This project does not replace it. Use the official CLI when local apply/teleport is the goal; use this connector when you need strict plan gates, explicit MCP tool contracts, compact structured results, and portable Claude/Codex plugins.

## Tests

```bash
npm run check
npm run smoke:mcp:live
npm run live:review -- owner/repo main
```

- `npm test`: offline unit tests.
- `npm run smoke:cli`: CLI help/version smoke.
- `npm run smoke:mcp`: MCP initialize, tool discovery, protocol errors.
- `npm run check:plugins`: verifies plugin `bin/` and `src/` are byte-identical to root.
- `npm run smoke:mcp:live`: real read-only API calls; no hard-coded session id.
- `npm run live:review`: creates a no-edit/no-PR Jules review session; no PR.

## Security

Never paste API keys into prompts, issue bodies, commits, or public logs. Jules documentation warns that publicly exposed keys may be automatically disabled. Rotate any key that was shared in plaintext and configure the replacement through a local secret/environment editor.

See `SECURITY.md` for storage and disclosure details.
