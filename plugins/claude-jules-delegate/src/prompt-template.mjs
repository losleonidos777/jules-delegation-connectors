export const REQUIRED_PROMPT_SECTIONS = Object.freeze([
  'Goal',
  'Scope',
  'Constraints',
  'Acceptance criteria',
  'Validation commands',
  'Out of scope',
  'PR policy'
]);

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

export function reviewTaskTemplate({ repo = 'owner/repo', branch = 'main' } = {}) {
  return `# Jules Task

## Repo
${repo}

## Base branch
${branch}

## Goal
Perform a read-only engineering review of the repository code and documentation. Identify correctness, reliability, security, API compatibility, developer-experience, and test-coverage risks.

## Scope
- Read the complete repository, prioritizing runtime code, MCP integration, client configuration, tests, README, and operational documentation.
- Compare implementation assumptions with the current Google Jules REST API and current MCP behavior.

## Constraints
- Do not edit files.
- Do not create commits, branches, or pull requests.
- Do not expose credentials or include secrets in the response.
- Separate verified defects from suggestions and clearly label uncertainty.

## Acceptance criteria
- Return findings ordered by severity with file paths and concrete evidence.
- Include likely root causes for Claude Code Desktop and Codex integration failures.
- Recommend specific fixes and missing tests.
- End with a concise release-readiness assessment.

## Validation commands
- Inspect package.json scripts and test files.
- Review MCP server initialization, tool contracts, error handling, and client manifests.
- Review REST request and response parsing against current Jules API shapes.

## Out of scope
- Making any repository changes.
- Opening or merging a pull request.
- Broad product strategy unrelated to this connector.

## PR policy
Do not generate a PR. This is a review-only session.
`;
}

export function enforcePromptChecklist(prompt) {
  const text = String(prompt || '');
  return REQUIRED_PROMPT_SECTIONS.filter(section => !new RegExp(`##\\s+${escapeRegExp(section)}`, 'i').test(text));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
