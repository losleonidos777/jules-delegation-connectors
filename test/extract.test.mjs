import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityHeadline,
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
  splitUnifiedDiff,
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

test('truncates large text with a marker', () => {
  const value = truncateText('x'.repeat(100), 50);
  assert.ok(value.length <= 80);
  assert.match(value, /truncated/);
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
