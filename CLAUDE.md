# Claude Code project policy: Jules delegation

Use `/jules-delegate` or the `jules` MCP server when the user explicitly asks to delegate a scoped implementation or review to Google Jules.

- Run `jules-delegate doctor --repo owner/repo` or `jules_list_sources` before creating repository-backed sessions.
- Use structured prompts with goal, scope, constraints, acceptance criteria, validation commands, out-of-scope, and PR policy.
- Require plan approval for implementation sessions unless the user explicitly opts out.
- Ask the user before approving a plan, sending consequential feedback, or enabling auto-PR.
- Use compact result and changed-file tools first, then request one file diff, validation output, or a capped whole patch as needed.
- Stop and report at plan approval, user feedback, failure, pause, or completion states.
- Never include keys, tokens, credentials, or private customer data in Jules prompts or logs.
- Review every produced diff and validation result before saying the work is ready.
