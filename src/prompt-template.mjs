export function taskTemplate({ repo = 'owner/repo', branch = 'main', goal = 'Describe the precise coding task here.' } = {}) {
  return `# Jules Task

## Repo
${repo}

## Base branch
${branch}

## Goal
${goal}

## Scope
- List the directories, files, modules, or behavior Jules may change.

## Constraints
- Do not change public API behavior unless stated in acceptance criteria.
- Do not add dependencies unless explicitly approved.
- Do not include secrets, credentials, tokens, or private customer data.

## Acceptance criteria
- Add concrete pass/fail requirements.
- Include regression tests for bug fixes.

## Validation commands
- npm test
- npm run lint

## Out of scope
- Architectural rewrites.
- Unrelated refactors.
- Database migrations unless explicitly requested.

## PR policy
Generate a PR only when explicitly requested by the orchestrator. Never merge.
`;
}

export function enforcePromptChecklist(prompt) {
  const required = ['Goal', 'Scope', 'Acceptance criteria'];
  const missing = required.filter(section => !new RegExp(`##\\s+${escapeRegExp(section)}`, 'i').test(prompt));
  return missing;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
