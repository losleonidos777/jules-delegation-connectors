import { JulesApi } from './jules-api.mjs';
import { resolveSource, assertBranchAllowed, defaultBranch } from './source-resolver.mjs';
import { LocalState } from './state.mjs';
import { extractPatches, formatPlan, latestPatch, latestPlan, summarizeResult } from './extract.mjs';
import { formatSources } from './format.mjs';

export const TOOLS = [
  {
    name: 'jules_list_sources',
    description: 'List GitHub repositories already connected to Google Jules. Use before creating sessions; Jules sources are read-only through the API.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Optional owner/repo filter.' }
      }
    }
  },
  {
    name: 'jules_create_session',
    description: 'Create a Google Jules coding session for a scoped GitHub task. Defaults to requirePlanApproval=true.',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', description: 'Structured Jules task prompt with goal, scope, constraints, acceptance criteria, validation commands, and out-of-scope.' },
        repo: { type: 'string', description: 'GitHub repository in owner/repo form. Preferred over source when available.' },
        source: { type: 'string', description: 'Exact Jules source resource name, for example sources/github-myorg-myrepo.' },
        branch: { type: 'string', description: 'Starting branch. Defaults to source default branch.' },
        title: { type: 'string', description: 'Session title.' },
        requirePlanApproval: { type: 'boolean', description: 'Whether Jules should wait for explicit plan approval. Default true.' },
        autoCreatePr: { type: 'boolean', description: 'Whether Jules should automatically create a pull request. Use only when explicitly requested.' },
        skipBranchCheck: { type: 'boolean', description: 'Skip local branch-list validation if Jules source branch list is stale.' }
      }
    }
  },
  {
    name: 'jules_get_session',
    description: 'Get a Jules session by id or sessions/id.',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: { sessionId: { type: 'string' } }
    }
  },
  {
    name: 'jules_list_activities',
    description: 'List activity feed for a Jules session, including plans, progress updates, artifacts, completion, and failures.',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: { sessionId: { type: 'string' }, pageSize: { type: 'number', default: 100 } }
    }
  },
  {
    name: 'jules_get_plan',
    description: 'Extract and format the latest planGenerated activity from a Jules session.',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: { sessionId: { type: 'string' } }
    }
  },
  {
    name: 'jules_approve_plan',
    description: 'Approve the latest pending plan for a Jules session. Only use after user approval.',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: { sessionId: { type: 'string' } }
    }
  },
  {
    name: 'jules_send_message',
    description: 'Send feedback, answers, or extra instructions to a Jules session.',
    inputSchema: {
      type: 'object',
      required: ['sessionId', 'prompt'],
      properties: { sessionId: { type: 'string' }, prompt: { type: 'string' } }
    }
  },
  {
    name: 'jules_get_result',
    description: 'Return a concise summary of session status, PR outputs, latest plan, latest patch metadata, and recent activities.',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: { sessionId: { type: 'string' } }
    }
  },
  {
    name: 'jules_get_patch',
    description: 'Extract latest or all non-empty unified diff patches from Jules activity artifacts.',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string' },
        mode: { type: 'string', enum: ['latest', 'all'], default: 'latest' }
      }
    }
  }
];

export async function callTool(name, args = {}, { api = new JulesApi(), state = new LocalState() } = {}) {
  switch (name) {
    case 'jules_list_sources': {
      const sources = await api.listSources();
      const filtered = args.repo ? sources.filter(source => `${source.githubRepo?.owner}/${source.githubRepo?.repo}`.toLowerCase() === String(args.repo).toLowerCase()) : sources;
      return { text: formatSources(filtered), data: filtered };
    }
    case 'jules_create_session': {
      const { name: sourceName, source } = await resolveSource(api, { repo: args.repo, source: args.source });
      const branch = args.branch || defaultBranch(source);
      assertBranchAllowed(source, branch, { skipBranchCheck: Boolean(args.skipBranchCheck) });
      const session = await api.createSession({
        prompt: required(args.prompt, 'prompt'),
        title: args.title,
        source: sourceName,
        branch,
        requirePlanApproval: args.requirePlanApproval !== false,
        autoCreatePr: Boolean(args.autoCreatePr)
      });
      await state.upsertSession(session, { repo: args.repo, branch, source: sourceName, autoCreatePr: Boolean(args.autoCreatePr) });
      await state.savePrompt(session.name || session.id, args.prompt);
      return { text: JSON.stringify(session, null, 2), data: session };
    }
    case 'jules_get_session': {
      const session = await api.getSession(required(args.sessionId, 'sessionId'));
      return { text: JSON.stringify(session, null, 2), data: session };
    }
    case 'jules_list_activities': {
      const activities = await api.listActivities(required(args.sessionId, 'sessionId'), { pageSize: args.pageSize || 100 });
      return { text: JSON.stringify(activities, null, 2), data: activities };
    }
    case 'jules_get_plan': {
      const activities = await api.listActivities(required(args.sessionId, 'sessionId'));
      const plan = latestPlan(activities);
      return { text: formatPlan(plan), data: plan || null };
    }
    case 'jules_approve_plan': {
      const res = await api.approvePlan(required(args.sessionId, 'sessionId'));
      return { text: `Approved latest plan for ${args.sessionId}.`, data: res };
    }
    case 'jules_send_message': {
      const res = await api.sendMessage(required(args.sessionId, 'sessionId'), required(args.prompt, 'prompt'));
      return { text: `Sent message to ${args.sessionId}.`, data: res };
    }
    case 'jules_get_result': {
      const [session, activities] = await Promise.all([api.getSession(required(args.sessionId, 'sessionId')), api.listActivities(args.sessionId)]);
      return { text: summarizeResult(session, activities), data: { session, activities } };
    }
    case 'jules_get_patch': {
      const activities = await api.listActivities(required(args.sessionId, 'sessionId'));
      const patches = extractPatches(activities);
      if (!patches.length) return { text: 'No non-empty gitPatch.unidiffPatch artifacts found.', data: [] };
      const text = args.mode === 'all' ? patches.map(p => p.unidiffPatch).join('\n') : latestPatch(activities).unidiffPatch;
      return { text, data: patches };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function required(value, name) {
  if (value === undefined || value === null || value === '') throw new Error(`${name} is required`);
  return value;
}
