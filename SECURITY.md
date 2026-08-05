# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's security advisory flow when available. Do not open a public issue containing credentials, exploit details, private repository names, customer data, or Jules session URLs.

## API keys

- Treat `JULES_API_KEY` as a secret.
- Never put it in a Jules prompt, MCP argument, committed config file, screenshot, issue, PR, chat transcript, or CI log.
- Configure it through the local environment editor, shell environment, or a secret manager.
- Rotate a key immediately if it is pasted into any public or semi-public channel. Google may automatically disable exposed keys.
- The connector redacts common key/token/password forms on a best-effort basis, but redaction is not a substitute for secret hygiene.

## Local data

By default, session metadata, redacted prompts, logs, and patches are stored below `.jules-orchestrator/`. Plugin installations use their client-specific data directory when configured. These files may still contain repository names, task details, source code patches, session URLs, and command output.

For sensitive work:

- Set `JULES_STATE_DIR` to encrypted storage.
- Apply restrictive filesystem permissions.
- Delete artifacts when they are no longer needed.
- Do not sync the state directory to public cloud folders.

## Network and execution model

- The connector sends prompts and feedback to the configured Jules API endpoint.
- Repository-backed sessions require a repository connected to Jules through the user's account.
- API reads may retry transient failures; writes are never retried automatically.
- `AUTO_CREATE_PR` is disabled by default.
- Implementation sessions require plan approval by default.
- Review prompts explicitly request no edits, commits, branches, or pull requests, but that instruction is not a hard sandbox; users must inspect the returned state, artifacts, and outputs.

## MCP clients

The MCP server uses newline-delimited stdio JSON-RPC. It writes protocol messages only to stdout and diagnostics only to stderr. Mutating tools advertise explicit user-interaction metadata, but the host client remains responsible for enforcing approvals and process isolation.

## Alpha API risk

The Jules REST API is versioned `v1alpha`; fields and behavior may change. Parsing is defensive, but a breaking upstream change can still cause failures. Pin releases, run the offline and live smoke tests, and inspect error bodies after redaction before updating production automation.
