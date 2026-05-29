# Jules Delegation Connectors

Portable connector layer that lets Claude Code or Codex act as an engineering lead while Google Jules executes scoped asynchronous GitHub coding tasks.

The repository contains:

- `jules-delegate`: zero-dependency Node.js CLI for the Google Jules REST API.
- `jules-mcp`: zero-dependency MCP stdio server exposing Jules tools to Claude Code, Codex, Cursor, and other MCP clients.
- Claude Code standalone skill and shareable Claude Code plugin.
- Codex standalone skill and Codex plugin.
- Prompt templates, MCP config examples, and lightweight tests.

## Requirements

- Node.js 20+.
- A Jules API key in `JULES_API_KEY`.
- The target GitHub repository must already be connected to Jules through the Jules web app / GitHub App. The Jules API can list sources, but cannot create them.

```bash
export JULES_API_KEY="..."
node ./bin/jules-delegate.mjs sources
```

## CLI quickstart

```bash
# 1. See connected repositories
node ./bin/jules-delegate.mjs sources

# 2. Create a safe session that waits for explicit plan approval
node ./bin/jules-delegate.mjs create \
  --repo owner/repo \
  --branch main \
  --title "Fix login without avatar" \
  --prompt-file templates/jules-task.md

# 3. Watch until Jules needs plan approval, feedback, or reaches a terminal state
node ./bin/jules-delegate.mjs watch sessions/123456

# 4. Read the generated plan
node ./bin/jules-delegate.mjs plan sessions/123456

# 5. Approve the plan or send feedback
node ./bin/jules-delegate.mjs approve sessions/123456
node ./bin/jules-delegate.mjs tell sessions/123456 --message-file feedback.md

# 6. Fetch result and patch
node ./bin/jules-delegate.mjs result sessions/123456
node ./bin/jules-delegate.mjs patch sessions/123456 --output jules.patch
```

`requirePlanApproval` is enabled by default. Use `--no-require-plan` only for low-risk automation where your review policy permits auto-approved plans.

## Claude Code standalone skill

Copy the skill into a project or user skill directory:

```bash
# From your target repository:
mkdir -p .claude/skills
cp -R /absolute/path/to/jules-delegation-connectors/.claude/skills/jules-delegate .claude/skills/
```

Then invoke it directly:

```text
/jules-delegate Fix issue #123 in owner/repo. Scope: auth tests only. Branch: main.
```

The skill will instruct Claude to form a structured Jules task, run the CLI, stop at plan approval, and return the plan/PR/diff summary to you.

## Claude Code plugin

The plugin bundles the skill, MCP server config, and a self-contained copy of the connector implementation.

```bash
claude --plugin-dir ./plugins/claude-jules-delegate
```

Inside Claude Code:

```text
/plugin reload
/mcp
/jules-delegate:delegate Fix issue #123 in owner/repo. Branch main. Add regression tests.
```

For project-scoped MCP without the plugin:

```bash
claude mcp add --transport stdio jules -- node /absolute/path/to/bin/jules-mcp.mjs
```

## Codex standalone skill

Codex repository skills live under `.agents/skills`:

```bash
# From your target repository:
mkdir -p .agents/skills
cp -R /absolute/path/to/jules-delegation-connectors/.agents/skills/jules-delegate .agents/skills/
```

Invoke explicitly with `$jules-delegate` or let Codex trigger the skill when the task matches the description.

## Codex MCP config

```bash
codex mcp add jules --env JULES_API_KEY="$JULES_API_KEY" -- node /absolute/path/to/bin/jules-mcp.mjs
```

Or copy `examples/codex-config.toml` into `.codex/config.toml` or `~/.codex/config.toml` and adjust the absolute path.

## Codex plugin

The Codex plugin is in `plugins/codex-jules-delegate`. It is self-contained: the plugin folder includes its own `bin/` and `src/` copy of the connector. For local marketplace testing, see `plugins/codex-marketplace/marketplace.json`.

## MCP tools

The MCP server exposes:

- `jules_list_sources`
- `jules_create_session`
- `jules_get_session`
- `jules_list_activities`
- `jules_get_plan`
- `jules_approve_plan`
- `jules_send_message`
- `jules_get_result`
- `jules_get_patch`

## State and artifacts

By default the CLI stores local state under `.jules-orchestrator/`:

```text
.jules-orchestrator/
  sessions.json
  prompts/
  logs/
  patches/
```

Prompts and logs are best-effort redacted before writing. Do not put secrets in prompts.

## Safety defaults

- Always resolve the source by calling `sources`; do not construct source names manually.
- Require plan approval by default.
- Do not enable `AUTO_CREATE_PR` unless the user explicitly asks and the task is low risk.
- Stop watches when Jules reaches `AWAITING_PLAN_APPROVAL` or `AWAITING_USER_FEEDBACK`.
- Return PR URL, session URL, patch summary, and manual review checklist.
- Treat API shapes as alpha; all Jules REST calls are isolated in `src/jules-api.mjs`.

## Tests

```bash
npm test                  # offline unit tests (no network)
npm run smoke:cli         # CLI --help renders
npm run smoke:mcp         # MCP stdio handshake + tools/list
npm run smoke:mcp:live    # live MCP tool calls (requires JULES_API_KEY)
```

`smoke:mcp:live` exercises the `jules-mcp` stdio server end-to-end: `initialize` → `tools/list` → `tools/call` against `jules_list_sources` + `jules_get_session`, plus an error-path call that asserts `result.isError === true`. It hits the real Jules REST API and consumes one read each from `sources` and `sessions`. Override the session id with a positional arg: `node ./scripts/smoke-mcp-toolcalls.mjs sessions/<your-id>`.

The unit tests under `test/` do not call Google APIs.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) — quick-start for adding a CLI command or MCP tool, the source-duplication invariant across plugin folders, and the test/smoke matrix you should run before opening a PR.

## Security

See [SECURITY.md](./SECURITY.md). Do not put API keys, tokens, or customer data in Jules prompts; the connector best-effort redacts written prompts/logs but cannot redact what you send to the Jules API.
