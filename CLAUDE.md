# Claude Code project policy: Jules delegation

Use the `/jules-delegate` skill or the `jules` MCP server when the user asks Claude to hand a scoped implementation task to Google Jules.

Safety rules:

- Always call `sources` before creating a Jules session unless the user provided an exact `sources/...` resource name.
- Use `requirePlanApproval: true` by default.
- Ask the user before approving a plan or enabling `AUTO_CREATE_PR`.
- Do not put secrets in Jules prompts, logs, or feedback.
- Stop and report back when Jules enters `AWAITING_PLAN_APPROVAL` or `AWAITING_USER_FEEDBACK`.
- Review diff/patch summaries before telling the user a task is ready.
