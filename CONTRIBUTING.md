# Contributing

Thanks for helping improve Jules Delegation Connectors. The project intentionally stays small, auditable, and dependency-free at runtime.

## Development setup

```bash
git clone https://github.com/losleonidos777/jules-delegation-connectors
cd jules-delegation-connectors
node --version   # Node 20+
npm run check
```

Live checks require a Jules API key and a repository already connected in Jules:

```bash
export JULES_API_KEY="..."
npm run smoke:mcp:live
npm run live:review -- owner/repo main
```

Never commit a key or paste it into a task prompt.

## Design rules

1. **Zero runtime dependencies.** Use Node.js built-ins. Development-only dependencies also require a clear reason.
2. **Keep API drift isolated.** Jules REST paths, payloads, pagination, retry policy, and transport details belong in `src/jules-api.mjs`.
3. **Keep safe defaults.** Plan approval stays enabled for implementation sessions. Auto-PR remains explicit and opt-in.
4. **Never retry writes automatically.** Creating a session, approving a plan, and sending feedback are not safely idempotent.
5. **Keep MCP outputs bounded.** Return concise structured snapshots; expose large patches and validation logs through dedicated tools.
6. **Do not write logs to MCP stdout.** Stdio stdout is reserved for newline-delimited JSON-RPC.
7. **Do not put secrets in prompts, state, logs, tests, examples, commits, issues, or PRs.**

## Repository layout

```text
bin/                              CLI and MCP entrypoints
src/                              connector implementation
scripts/                          smoke tests, live helper, plugin sync
examples/                         client configuration examples
templates/                        canonical task prompt
.claude/skills/                   standalone Claude Code skill
.agents/skills/                   standalone Codex skill
plugins/claude-jules-delegate/    self-contained Claude Code plugin
plugins/codex-jules-delegate/     self-contained Codex plugin
test/                             offline node:test suite
docs/                             API notes and compatibility reviews
```

## Root/plugin synchronization

The Claude and Codex plugin folders include self-contained copies of `bin/` and `src/`. Edit the root copies only, then run:

```bash
npm run sync:plugins
npm run check:plugins
```

`check:plugins` fails if any mirrored file differs from root. Do not hand-edit a mirrored copy unless you immediately synchronize all copies.

## Adding a CLI command

1. Add the command to `bin/jules-delegate.mjs` usage and dispatch.
2. Keep REST access inside `JulesApi`.
3. Validate user input with `UserInputError`.
4. Redact failures before printing.
5. Add offline tests and documentation.
6. Run `npm run sync:plugins` and `npm run check`.

## Adding an MCP tool

1. Add the schema to `TOOLS` in `src/mcp-tools.mjs`.
2. Set accurate MCP annotations.
3. Add `_meta["anthropic/requiresUserInteraction"]` for mutating operations.
4. Add a bounded-output strategy for large data.
5. Implement the dispatch case and tests.
6. Update client approval examples when the tool changes the read/write surface.

## Release checklist

- Update `VERSION`, `package.json`, both plugin manifests, and `CHANGELOG.md` together.
- Run `npm run sync:plugins`.
- Run `npm run check` on Node 20 or later.
- Run live read-only smoke tests with a non-production key when possible.
- Review the diff for generated state, prompts, logs, patches, and credentials.
- Describe compatibility changes and manual test steps in the PR.
