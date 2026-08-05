import { JulesApi } from './jules-api.mjs';
import { resolveSource, assertBranchAllowed, defaultBranch, findSource, normalizeRepo } from './source-resolver.mjs';
import { LocalState } from './state.mjs';
import {
  extractBashOutputs,
  extractChangedFiles,
  extractPatches,
  findFileDiff,
  formatBashOutputs,
  formatChangedFiles,
  formatPlan,
  latestPatch,
  latestPlan,
  resultSnapshot,
  summarizeResult,
  truncateText
} from './extract.mjs';
import { formatSessions, formatSources } from './format.mjs';
import { enforcePromptChecklist } from './prompt-template.mjs';

const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
const WRITE_ADDITIVE = Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
const REQUIRE_USER = Object.freeze({ 'anthropic/requiresUserInteraction': true });

export const TOOLS = [
  tool({
    name: 'jules_list_sources',
    title: 'List Jules sources',
    description: 'List GitHub repositories already connected to Google Jules. Use before creating repository-backed sessions.',
    annotations: READ_ONLY,
    inputSchema: schema({ repo: { type: 'string', description: 'Optional owner/repo or GitHub URL filter.' } })
  }),
  tool({
    name: 'jules_list_sessions',
    title: 'List Jules sessions',
    description: 'List recent Jules sessions available to the current API key.',
    annotations: READ_ONLY,
    inputSchema: schema({ pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 30 } })
  }),
  tool({
    name: 'jules_create_session',
    title: 'Create Jules session',
    description: 'Create a scoped Google Jules coding session. Repository sessions require repo/source; repoless sessions require repoless=true. Plan approval defaults to true.',
    annotations: WRITE_ADDITIVE,
    meta: REQUIRE_USER,
    inputSchema: schema({
      prompt: { type: 'string', description: 'Structured task prompt with goal, scope, constraints, acceptance criteria, validation commands, out-of-scope, and PR policy.' },
      repo: { type: 'string', description: 'GitHub repository in owner/repo form or a GitHub URL.' },
      source: { type: 'string', description: 'Exact Jules source resource name, for example sources/github-myorg-myrepo.' },
      branch: { type: 'string', description: 'Starting branch. Defaults to the source default branch.' },
      title: { type: 'string', description: 'Optional session title.' },
      repoless: { type: 'boolean', default: false, description: 'Create an ephemeral repoless session without sourceContext.' },
      requirePlanApproval: { type: 'boolean', default: true, description: 'Require explicit plan approval. Defaults to true.' },
      autoCreatePr: { type: 'boolean', default: false, description: 'Automatically create a pull request. Repository sessions only; use only when explicitly requested.' },
      skipBranchCheck: { type: 'boolean', default: false, description: 'Skip validation against the source branch list when it is stale.' },
      skipPromptChecklist: { type: 'boolean', default: false, description: 'Bypass the structured-prompt checklist. Use only for compatibility.' }
    }, ['prompt'])
  }),
  tool({
    name: 'jules_get_session',
    title: 'Get Jules session',
    description: 'Get a Jules session by id or sessions/id.',
    annotations: READ_ONLY,
    inputSchema: schema({ sessionId: { type: 'string' } }, ['sessionId'])
  }),
  tool({
    name: 'jules_list_activities',
    title: 'List Jules activities',
    description: 'List immutable activity events for a session. Use since with an RFC 3339 createTime cursor to fetch only newer events.',
    annotations: READ_ONLY,
    meta: { 'anthropic/maxResultSizeChars': 300000 },
    inputSchema: schema({
      sessionId: { type: 'string' },
      pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
      since: { type: 'string', description: 'Optional RFC 3339 createTime cursor.' }
    }, ['sessionId'])
  }),
  tool({
    name: 'jules_get_activity',
    title: 'Get Jules activity',
    description: 'Retrieve one activity by session id and activity id/resource name.',
    annotations: READ_ONLY,
    inputSchema: schema({ sessionId: { type: 'string' }, activityId: { type: 'string' } }, ['sessionId', 'activityId'])
  }),
  tool({
    name: 'jules_get_plan',
    title: 'Get latest Jules plan',
    description: 'Extract and format the latest planGenerated activity from a Jules session.',
    annotations: READ_ONLY,
    inputSchema: schema({ sessionId: { type: 'string' } }, ['sessionId'])
  }),
  tool({
    name: 'jules_approve_plan',
    title: 'Approve Jules plan',
    description: 'Approve the latest pending plan. Call only after the human has reviewed and explicitly approved it.',
    annotations: WRITE_ADDITIVE,
    meta: REQUIRE_USER,
    inputSchema: schema({ sessionId: { type: 'string' } }, ['sessionId'])
  }),
  tool({
    name: 'jules_send_message',
    title: 'Send Jules feedback',
    description: 'Send feedback, answers, or extra instructions to an active Jules session.',
    annotations: WRITE_ADDITIVE,
    meta: REQUIRE_USER,
    inputSchema: schema({ sessionId: { type: 'string' }, prompt: { type: 'string' } }, ['sessionId', 'prompt'])
  }),
  tool({
    name: 'jules_get_result',
    title: 'Get Jules result',
    description: 'Return a concise session summary and compact structured snapshot without duplicating the full activity feed or patch.',
    annotations: READ_ONLY,
    meta: { 'anthropic/maxResultSizeChars': 200000 },
    inputSchema: schema({ sessionId: { type: 'string' } }, ['sessionId'])
  }),
  tool({
    name: 'jules_list_changed_files',
    title: 'List Jules changed files',
    description: 'Summarize files in the latest Jules unified diff without returning the full patch.',
    annotations: READ_ONLY,
    inputSchema: schema({ sessionId: { type: 'string' } }, ['sessionId'])
  }),
  tool({
    name: 'jules_get_file_diff',
    title: 'Get Jules file diff',
    description: 'Return the most recent unified diff for one exact repository-relative path. Output is capped to protect client context.',
    annotations: READ_ONLY,
    meta: { 'anthropic/maxResultSizeChars': 250000 },
    inputSchema: schema({
      sessionId: { type: 'string' },
      filePath: { type: 'string', description: 'Exact repository-relative file path.' },
      maxChars: { type: 'integer', minimum: 1000, maximum: 250000, default: 200000 }
    }, ['sessionId', 'filePath'])
  }),
  tool({
    name: 'jules_get_patch',
    title: 'Get Jules patch',
    description: 'Extract the latest or all unified diff patches. MCP output is capped; use the CLI patch command for an unbounded file export.',
    annotations: READ_ONLY,
    meta: { 'anthropic/maxResultSizeChars': 500000 },
    inputSchema: schema({
      sessionId: { type: 'string' },
      mode: { type: 'string', enum: ['latest', 'all'], default: 'latest' },
      maxChars: { type: 'integer', minimum: 1000, maximum: 500000, default: 450000 }
    }, ['sessionId'])
  }),
  tool({
    name: 'jules_get_bash_outputs',
    title: 'Get Jules validation output',
    description: 'Extract shell commands, outputs, and exit codes recorded as bashOutput artifacts.',
    annotations: READ_ONLY,
    meta: { 'anthropic/maxResultSizeChars': 250000 },
    inputSchema: schema({
      sessionId: { type: 'string' },
      outputLimit: { type: 'integer', minimum: 200, maximum: 20000, default: 4000 }
    }, ['sessionId'])
  })
];

export async function callTool(name, args = {}, { api = new JulesApi(), state = new LocalState() } = {}) {
  switch (name) {
    case 'jules_list_sources': {
      const sources = await api.listSources();
      const selector = args.repo ? normalizeRepo(args.repo) : undefined;
      const filtered = selector ? sources.filter(source => findSource([source], selector)) : sources;
      return { text: formatSources(filtered), data: filtered };
    }
    case 'jules_list_sessions': {
      const sessions = await api.listSessions({ pageSize: args.pageSize || 30 });
      return { text: formatSessions(sessions), data: sessions };
    }
    case 'jules_create_session': {
      const prompt = required(args.prompt, 'prompt');
      const missing = enforcePromptChecklist(prompt);
      if (missing.length && !args.skipPromptChecklist) {
        throw new Error(`Prompt is missing required sections: ${missing.join(', ')}`);
      }

      let sourceName;
      let source;
      let branch;
      if (args.repoless) {
        if (args.repo || args.source || args.branch || args.autoCreatePr) {
          throw new Error('repoless=true cannot be combined with repo, source, branch, or autoCreatePr');
        }
      } else {
        ({ name: sourceName, source } = await resolveSource(api, { repo: args.repo, source: args.source }));
        branch = args.branch || defaultBranch(source);
        assertBranchAllowed(source, branch, { skipBranchCheck: Boolean(args.skipBranchCheck) });
      }

      const session = await api.createSession({
        prompt,
        title: args.title,
        source: sourceName,
        branch,
        requirePlanApproval: args.requirePlanApproval !== false,
        autoCreatePr: Boolean(args.autoCreatePr)
      });
      await state.upsertSession(session, {
        repo: args.repo,
        branch,
        source: sourceName,
        repoless: Boolean(args.repoless),
        autoCreatePr: Boolean(args.autoCreatePr)
      });
      await state.savePrompt(session.name || session.id, prompt);
      return { text: JSON.stringify(session, null, 2), data: session };
    }
    case 'jules_get_session': {
      const session = await api.getSession(required(args.sessionId, 'sessionId'));
      return { text: JSON.stringify(session, null, 2), data: session };
    }
    case 'jules_list_activities': {
      const activities = await api.listActivities(required(args.sessionId, 'sessionId'), {
        pageSize: args.pageSize || 100,
        since: args.since
      });
      return { text: JSON.stringify(activities, null, 2), data: activities };
    }
    case 'jules_get_activity': {
      const activity = await api.getActivity(required(args.sessionId, 'sessionId'), required(args.activityId, 'activityId'));
      return { text: JSON.stringify(activity, null, 2), data: activity };
    }
    case 'jules_get_plan': {
      const activities = await api.listActivities(required(args.sessionId, 'sessionId'));
      const plan = latestPlan(activities);
      return { text: formatPlan(plan), data: plan || null };
    }
    case 'jules_approve_plan': {
      const sessionId = required(args.sessionId, 'sessionId');
      const response = await api.approvePlan(sessionId);
      return { text: `Approved latest plan for ${sessionId}.`, data: response };
    }
    case 'jules_send_message': {
      const sessionId = required(args.sessionId, 'sessionId');
      const response = await api.sendMessage(sessionId, required(args.prompt, 'prompt'));
      return { text: `Sent message to ${sessionId}.`, data: response };
    }
    case 'jules_get_result': {
      const sessionId = required(args.sessionId, 'sessionId');
      const [session, activities] = await Promise.all([api.getSession(sessionId), api.listActivities(sessionId)]);
      return { text: summarizeResult(session, activities), data: resultSnapshot(session, activities) };
    }
    case 'jules_list_changed_files': {
      const activities = await api.listActivities(required(args.sessionId, 'sessionId'));
      const files = extractChangedFiles(activities);
      return { text: formatChangedFiles(files), data: files };
    }
    case 'jules_get_file_diff': {
      const activities = await api.listActivities(required(args.sessionId, 'sessionId'));
      const file = findFileDiff(activities, required(args.filePath, 'filePath'));
      if (!file) return { text: `No Jules diff found for ${args.filePath}.`, data: null };
      const maxChars = clampInteger(args.maxChars, 1000, 250000, 200000);
      const text = truncateText(file.unidiffPatch, maxChars);
      return {
        text,
        data: {
          ...removeUndefined({ ...file, unidiffPatch: undefined }),
          totalChars: file.unidiffPatch.length,
          returnedChars: text.length,
          truncated: text.length < file.unidiffPatch.length
        }
      };
    }
    case 'jules_get_patch': {
      const activities = await api.listActivities(required(args.sessionId, 'sessionId'));
      const patches = extractPatches(activities);
      if (!patches.length) return { text: 'No non-empty gitPatch.unidiffPatch artifacts found.', data: { patches: [], truncated: false } };
      const fullText = args.mode === 'all' ? patches.map(patch => patch.unidiffPatch).join('\n') : latestPatch(activities).unidiffPatch;
      const maxChars = clampInteger(args.maxChars, 1000, 500000, 450000);
      const text = truncateText(fullText, maxChars);
      return {
        text,
        data: {
          patches: patches.map(patch => ({ ...patch, unidiffPatch: undefined })).map(removeUndefined),
          mode: args.mode === 'all' ? 'all' : 'latest',
          totalChars: fullText.length,
          returnedChars: text.length,
          truncated: text.length < fullText.length
        }
      };
    }
    case 'jules_get_bash_outputs': {
      const activities = await api.listActivities(required(args.sessionId, 'sessionId'));
      const outputs = extractBashOutputs(activities);
      const outputLimit = clampInteger(args.outputLimit, 200, 20000, 4000);
      const compact = outputs.map(item => ({ ...item, output: truncateText(item.output, outputLimit) }));
      return { text: formatBashOutputs(compact, { outputLimit }), data: compact };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function tool({ name, title, description, inputSchema, annotations, meta }) {
  const definition = { name, title, description, inputSchema, annotations };
  if (meta) definition._meta = meta;
  return definition;
}

function schema(properties, requiredFields = []) {
  const value = { type: 'object', properties, additionalProperties: false };
  if (requiredFields.length) value.required = requiredFields;
  return value;
}

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
