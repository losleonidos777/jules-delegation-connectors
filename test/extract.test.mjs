import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityHeadline,
  compactActivities,
  extractBashOutputs,
  extractChangedFiles,
  extractPatches,
  findFileDiff,
  formatBashOutputs,
  formatChangedFiles,
  formatPlan,
  latestAgentMessage,
  latestPatch,
  latestPlan,
  resultSnapshot,
  signalActivities,
  splitUnifiedDiff,
  summarizeActivities,
  summarizeResult,
  truncateText
} from '../src/extract.mjs';

const activities = [
  {
    id: 'a1',
    name: 'sessions/1/activities/a1',
    createTime: '2026-01-01T00:00:00Z',
    originator: 'agent',
    planGenerated: {
      plan: {
        id: 'p1',
        steps: [{ title: 'Add regression test' }, { index: 1, title: 'Fix null avatar handling' }]
      }
    }
  },
  {
    id: 'a2',
    name: 'sessions/1/activities/a2',
    createTime: '2026-01-01T00:01:00Z',
    agentMessaged: { agentMessage: 'Implemented the fix.' },
    artifacts: [
      {
        changeSet: {
          gitPatch: {
            baseCommitId: 'abc',
            suggestedCommitMessage: 'fix: handle missing avatar',
            unidiffPatch: 'diff --git a/auth.js b/auth.js\n'
          }
        }
      },
      {
        bashOutput: {
          command: 'npm test',
          output: '15 tests passed',
          exitCode: 0
        }
      }
    ]
  }
];

test('extracts and numbers the latest plan', () => {
  const plan = latestPlan(activities);
  assert.equal(plan.id, 'p1');
  assert.equal(formatPlan(plan), 'Plan p1\n1. Add regression test\n2. Fix null avatar handling');
});

test('extracts latest patch and bash output', () => {
  assert.equal(extractPatches(activities).length, 1);
  assert.match(latestPatch(activities).unidiffPatch, /diff --git/);
  const outputs = extractBashOutputs(activities);
  assert.deepEqual(outputs.map(({ command, output, exitCode }) => ({ command, output, exitCode })), [
    { command: 'npm test', output: '15 tests passed', exitCode: 0 }
  ]);
  assert.match(formatBashOutputs(outputs), /npm test \(exit 0\)/);
});

test('reads current Jules message and failure fields', () => {
  assert.equal(latestAgentMessage(activities).text, 'Implemented the fix.');
  assert.equal(activityHeadline({ sessionFailed: { reason: 'quota exhausted' } }), 'quota exhausted');
  assert.equal(activityHeadline({ userMessaged: { userMessage: 'please continue' } }), 'please continue');
});

test('returns compact result snapshot without embedding the patch', () => {
  const session = {
    name: 'sessions/1',
    state: 'COMPLETED',
    outputs: [{ pullRequest: { url: 'https://github.com/x/y/pull/1', title: 'Fix' } }]
  };
  const snapshot = resultSnapshot(session, activities);
  assert.equal(snapshot.activityCount, 2);
  assert.equal(snapshot.latestPatch.baseCommitId, 'abc');
  assert.equal(Object.hasOwn(snapshot.latestPatch, 'unidiffPatch'), false);
  assert.equal(snapshot.bashOutputs[0].exitCode, 0);

  const text = summarizeResult(session, activities);
  assert.match(text, /COMPLETED/);
  assert.match(text, /Pull requests/);
  assert.match(text, /Recent validation commands/);
  assert.match(text, /Patch bytes/);
});

test('tolerates malformed activity payloads', () => {
  const malformed = [
    { id: 'p1', planGenerated: { plan: { id: 'plan', steps: null } } },
    { id: 'a1', artifacts: { malformed: true } },
    { id: 'a2', artifacts: [{ changeSet: { gitPatch: { unidiffPatch: { not: 'text' } } } }] },
    { id: 'm1', agentMessaged: { agentMessage: { nested: 'message' } } },
    null
  ];
  assert.doesNotThrow(() => summarizeResult({ id: '1', outputs: null }, malformed));
  assert.equal(extractPatches(malformed).length, 0);
  assert.equal(extractBashOutputs(malformed).length, 0);
});

test('truncates large text within the requested cap and reports the exact drop', () => {
  const value = truncateText('x'.repeat(100), 50);
  assert.ok(value.length <= 50, `expected at most 50 chars, got ${value.length}`);
  const kept = value.slice(0, value.indexOf('\n...[truncated'));
  const dropped = Number(value.match(/truncated (\d+) chars/)[1]);
  assert.equal(kept.length + dropped, 100);
});

test('reads agent narration from progressUpdated, dedupes repeated patches, and drops empty progress events', () => {
  const patch = 'diff --git a/docs/x.md b/docs/x.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/x.md\n@@ -0,0 +1 @@\n+hi\n';
  const changeSet = { source: 'sources/github/acme/repo', gitPatch: { baseCommitId: 'abc', unidiffPatch: patch } };
  const live = [
    { id: 'p1', createTime: '2026-08-06T02:36:00Z', originator: 'agent', progressUpdated: {} },
    {
      id: 'p2',
      createTime: '2026-08-06T02:36:10Z',
      originator: 'agent',
      progressUpdated: { title: 'Generated the file', description: 'I created docs/x.md from the front matter.' },
      artifacts: [{ changeSet }]
    },
    { id: 'p3', createTime: '2026-08-06T02:36:20Z', originator: 'agent', progressUpdated: {}, artifacts: [{ changeSet }] },
    {
      id: 'p4',
      createTime: '2026-08-06T02:36:30Z',
      originator: 'agent',
      progressUpdated: { title: 'Finished the task', description: 'Left the file in the working tree; no PR.' },
      artifacts: [{ changeSet }]
    },
    { id: 'done', createTime: '2026-08-06T02:36:40Z', originator: 'agent', sessionCompleted: {}, artifacts: [{ changeSet }] }
  ];

  assert.equal(extractPatches(live).length, 1);
  assert.equal(latestAgentMessage(live).text, 'Left the file in the working tree; no PR.');
  assert.match(summarizeResult({ name: 'sessions/1', state: 'COMPLETED' }, live), /## Final agent message/);
  assert.deepEqual(signalActivities(live).map(activity => activity.id), ['p2', 'p4', 'done']);
  assert.equal(summarizeActivities(live).split('\n').length, 3);

  const gitPatch = compactActivities(live)[1].artifacts[0].changeSet.gitPatch;
  assert.equal(gitPatch.unidiffPatchChars, patch.length);
  assert.equal(gitPatch.unidiffPatch, undefined);
  assert.equal(gitPatch.baseCommitId, 'abc');
});

test('splits unified diffs and retrieves one exact file diff', () => {
  const patch = [
    'diff --git a/src/old.mjs b/src/old.mjs',
    'index 1111111..2222222 100644',
    '--- a/src/old.mjs',
    '+++ b/src/old.mjs',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    'diff --git a/docs/new.md b/docs/new.md',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/docs/new.md',
    '@@ -0,0 +1 @@',
    '+hello',
    ''
  ].join('\n');
  const files = splitUnifiedDiff(patch);
  assert.deepEqual(files.map(file => [file.path, file.changeType]), [
    ['src/old.mjs', 'modified'],
    ['docs/new.md', 'added']
  ]);

  const acts = [{
    id: 'patch-activity',
    artifacts: [{ changeSet: { gitPatch: { baseCommitId: 'base', unidiffPatch: patch } } }]
  }];
  const summary = extractChangedFiles(acts);
  assert.equal(summary.length, 2);
  assert.match(formatChangedFiles(summary), /added docs\/new\.md/);
  const file = findFileDiff(acts, 'docs/new.md');
  assert.equal(file.path, 'docs/new.md');
  assert.match(file.unidiffPatch, /\+hello/);
  assert.equal(findFileDiff(acts, 'missing.txt'), null);
});
