import test from 'node:test';
import assert from 'node:assert/strict';
import { activityHeadline, extractPatches, formatPlan, latestAgentMessage, latestPatch, latestPlan, summarizeResult } from '../src/extract.mjs';

const activities = [
  {
    id: 'a1',
    createTime: '2026-01-01T00:00:00Z',
    originator: 'agent',
    planGenerated: {
      plan: {
        id: 'p1',
        steps: [{ index: 0, title: 'Add regression test' }, { index: 1, title: 'Fix null avatar handling' }]
      }
    }
  },
  {
    id: 'a2',
    name: 'sessions/1/activities/a2',
    createTime: '2026-01-01T00:01:00Z',
    artifacts: [
      {
        changeSet: {
          gitPatch: {
            baseCommitId: 'abc',
            suggestedCommitMessage: 'fix: handle missing avatar',
            unidiffPatch: 'diff --git a/auth.js b/auth.js\n'
          }
        }
      }
    ]
  }
];

test('extracts latest plan', () => {
  const plan = latestPlan(activities);
  assert.equal(plan.id, 'p1');
  assert.match(formatPlan(plan), /Add regression test/);
});

test('extracts latest patch', () => {
  assert.equal(extractPatches(activities).length, 1);
  assert.match(latestPatch(activities).unidiffPatch, /diff --git/);
});

test('summarizes session result', () => {
  const text = summarizeResult({ name: 'sessions/1', state: 'COMPLETED', outputs: [{ pullRequest: { url: 'https://github.com/x/y/pull/1', title: 'Fix' } }] }, activities);
  assert.match(text, /COMPLETED/);
  assert.match(text, /Pull requests/);
  assert.match(text, /Patch bytes/);
});

test('formatPlan numbers steps from 1 when first step has no index', () => {
  const plan = { id: 'p', steps: [{ title: 'first' }, { index: 1, title: 'second' }, { index: 2, title: 'third' }] };
  const formatted = formatPlan(plan);
  assert.match(formatted, /\n1\. first/);
  assert.match(formatted, /\n2\. second/);
  assert.match(formatted, /\n3\. third/);
});

test('latestAgentMessage reads real Jules agentMessaged.agentMessage field', () => {
  const acts = [
    { id: 'x1', createTime: '2026-01-01T00:00:00Z', agentMessaged: { agentMessage: 'first message' } },
    { id: 'x2', createTime: '2026-01-01T00:01:00Z', agentMessaged: { agentMessage: 'final deliverable text' } },
    { id: 'x3', createTime: '2026-01-01T00:02:00Z', progressUpdated: { title: 'done' } }
  ];
  const msg = latestAgentMessage(acts);
  assert.equal(msg.text, 'final deliverable text');
  assert.equal(msg.id, 'x2');
  assert.match(activityHeadline(acts[1]), /final deliverable text/);
});

test('summarizeResult surfaces Final agent message section', () => {
  const acts = [{ id: 'm1', createTime: '2026-01-01T00:00:00Z', agentMessaged: { agentMessage: 'SMOKE TEST OK' } }];
  const text = summarizeResult({ name: 'sessions/1', state: 'COMPLETED' }, acts);
  assert.match(text, /## Final agent message/);
  assert.match(text, /SMOKE TEST OK/);
});

test('summarizeResult tolerates partially populated activity payloads', () => {
  const acts = [
    { id: 'p1', planGenerated: { plan: { id: 'plan', steps: null } } },
    { id: 'a1', artifacts: { malformed: true } },
    { id: 'a2', artifacts: [{ changeSet: { gitPatch: { unidiffPatch: { not: 'text' } } } }] },
    { id: 'm1', agentMessaged: { agentMessage: { nested: 'message' } } }
  ];

  assert.doesNotThrow(() => summarizeResult({ id: '1', outputs: null }, acts));
  assert.equal(extractPatches(acts).length, 0);
});
