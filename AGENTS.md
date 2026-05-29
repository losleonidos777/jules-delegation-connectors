# Jules delegation policy for Codex and Claude-like coding agents

Use Jules as an asynchronous implementer, not as an uncontrolled supervisor.

Delegate to Jules when all of these are true:

- The task is scoped to a repository and branch already connected to Jules.
- The expected diff is small or moderate: bug fix, tests, docs, dependency bump, narrow refactor.
- The task can be expressed with concrete acceptance criteria and validation commands.
- No secrets or private customer data must be included in the prompt.

Do not delegate when the task is broad, ambiguous, requires architectural ownership, requires secret access, or requires immediate local context not available to Jules.

Default workflow:

1. Run `jules-delegate sources` or `jules_list_sources` to verify the repository source.
2. Write a structured task with goal, repo, branch, scope, constraints, acceptance criteria, validation commands, out-of-scope, and PR policy.
3. Create the session with plan approval required.
4. Watch until plan approval or user feedback is needed.
5. Show the plan to the human and wait for explicit approval before calling approve.
6. After completion, fetch result and patch, then summarize PR URL, touched areas, validation, risks, and manual review steps.

Never merge a Jules PR automatically.
