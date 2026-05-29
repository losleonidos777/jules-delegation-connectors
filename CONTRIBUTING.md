# Contributing

Thanks for helping improve the Jules delegation connectors. This guide is short on purpose — read it once, then read the code.

## Ground rules

1. **Zero runtime dependencies.** This package must stay installable with just Node 20+. If you reach for an npm dependency, stop and find another way. Tests use only `node:test` and `node:assert`.
2. **Jules REST is alpha.** All HTTP shape knowledge lives in `src/jules-api.mjs`. Do not let alpha-shape parsing leak into commands, formatters, MCP tools, or skills.
3. **Plan approval gate stays on by default.** Any change that would auto-approve a plan, auto-create a PR, or skip the prompt checklist must be opt-in and called out in the changelog.
4. **No secrets in prompts, ever.** Do not add code paths that move tokens, API keys, or credentials into Jules `prompt`, `sendMessage`, or task templates.

## Dev setup

```bash
git clone https://github.com/losleonidos777/jules-delegation-connectors
cd jules-delegation-connectors
node --version   # must be >= 20

# Offline checks
npm test                  # unit tests, no network
npm run smoke:cli         # CLI --help renders
npm run smoke:mcp         # MCP stdio handshake + tools/list

# Live checks (require a real Jules API key)
export JULES_API_KEY="..."
npm run smoke:mcp:live
node ./bin/jules-delegate.mjs sources
```

## Repository layout

```
bin/                     # CLI + MCP entrypoints (Node 20 ESM, no deps)
src/                     # connector implementation
src/jules-api.mjs        # isolated REST client — only file that knows alpha shapes
src/mcp-tools.mjs        # MCP tool schemas + dispatch
src/extract.mjs          # plan / patch / agent-message / PR extraction
src/source-resolver.mjs  # owner/repo → sources/... + branch validation
src/state.mjs            # .jules-orchestrator/* local state and prompt/patch persistence
src/prompt-template.mjs  # task-template generator + checklist enforcement
src/format.mjs, args.mjs, errors.mjs, io.mjs
docs/API_NOTES.md        # real-API observations and MCP semantics
test/                    # node:test offline tests, must not call Google APIs
scripts/smoke-*.mjs      # smoke tests (smoke-mcp.mjs offline, smoke-mcp-toolcalls.mjs live)
templates/jules-task.md  # canonical Jules task structure
.claude/skills/...       # drop-in Claude Code skill copy
.agents/skills/...       # drop-in Codex skill copy
plugins/claude-jules-delegate/  # shareable Claude Code plugin
plugins/codex-jules-delegate/   # shareable Codex plugin
plugins/codex-marketplace/      # local Codex marketplace manifest for plugin testing
examples/                # plug-and-play config snippets for MCP wiring
```

## The source-duplication invariant (read this before editing plugins)

Each plugin folder under `plugins/` currently carries its own copy of `bin/` and `src/` so that the plugin is self-contained when installed. **The plugin copies must be byte-identical to the root copies.** When you change anything under `src/` or `bin/`, mirror it into both:

```
plugins/claude-jules-delegate/{bin,src}/
plugins/codex-jules-delegate/{bin,src}/
```

A future change will consolidate this with a `scripts/sync-plugins.mjs` build step. Until then, the rule is "edit three places".

## How to add a CLI subcommand

1. Add a `cmdYourCommand(api, state, flags, positional)` async handler near the others in `bin/jules-delegate.mjs`.
2. Add the `case 'your-command':` branch to the `main()` dispatch.
3. Extend the `USAGE` constant with a one-line synopsis.
4. If the command persists data, route through `LocalState` instead of writing directly.
5. Mirror `bin/jules-delegate.mjs` into the two plugin folders.

## How to add an MCP tool

1. Append the schema to the `TOOLS` array in `src/mcp-tools.mjs`. Required and optional argument fields must be reflected in `inputSchema`.
2. Add the `case 'jules_your_tool':` branch to `callTool` and return `{ text, data }`. `text` is human-readable, `data` is structured (becomes `result.structuredContent` on the wire).
3. Make sure errors thrown by your branch are still caught by `bin/jules-mcp.mjs::tools/call` — they will surface as `result.isError = true` per MCP spec.
4. Mirror `src/mcp-tools.mjs` into the two plugin folders.

## How to test

- **Unit:** `npm test`. Add a `test/<topic>.test.mjs` that mocks `fetch` via the `fetchImpl` option on `JulesApi` — do not call Google in tests.
- **CLI smoke:** `npm run smoke:cli`.
- **MCP offline smoke:** `npm run smoke:mcp` — fakes `JULES_API_KEY`, asserts handshake + tools list.
- **MCP live smoke:** `npm run smoke:mcp:live` — requires a real `JULES_API_KEY`. Optionally pass a known session id: `node ./scripts/smoke-mcp-toolcalls.mjs sessions/<id>`.

Before opening a PR, run all four. The live smoke consumes one read each from `sources` and `sessions`.

## Commits and PRs

- Keep PRs scoped to one concern. Refactors and behaviour changes do not belong together.
- Mention in the PR body which plugin folders you mirrored to.
- Bump `version` in `package.json`, `plugins/claude-jules-delegate/.claude-plugin/plugin.json`, and `plugins/codex-jules-delegate/.codex-plugin/plugin.json` together. Add a `CHANGELOG.md` entry.
- Do not commit `.jules-orchestrator/` content; it is gitignored.
