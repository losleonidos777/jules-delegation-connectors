import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBranchAllowed,
  branchNames,
  defaultBranch,
  findSource,
  inferRepoFromGit,
  normalizeRepo,
  resolveSource
} from '../src/source-resolver.mjs';

const source = {
  name: 'sources/github/myorg/myrepo',
  id: 'github/myorg/myrepo',
  githubRepo: {
    owner: 'myorg',
    repo: 'myrepo',
    defaultBranch: { displayName: 'main' },
    branches: [{ displayName: 'main' }, { name: 'develop' }]
  }
};

test('normalizes HTTPS, SSH, and owner/repo selectors', () => {
  assert.equal(normalizeRepo('https://github.com/myorg/myrepo.git?tab=readme'), 'myorg/myrepo');
  assert.equal(normalizeRepo('git@github.com:myorg/myrepo.git'), 'myorg/myrepo');
  assert.equal(normalizeRepo('ssh://git@github.com/myorg/myrepo'), 'myorg/myrepo');
  assert.equal(normalizeRepo('myorg/myrepo'), 'myorg/myrepo');
  assert.throws(() => normalizeRepo('not-a-repo'), /owner\/repo/);
});

test('infers the repository from git origin without shell parsing', async () => {
  const repo = await inferRepoFromGit({
    cwd: '/tmp/project',
    execFileImpl: async (command, args, options) => {
      assert.equal(command, 'git');
      assert.deepEqual(args, ['config', '--get', 'remote.origin.url']);
      assert.equal(options.cwd, '/tmp/project');
      return { stdout: 'git@github.com:myorg/myrepo.git\n' };
    }
  });
  assert.equal(repo, 'myorg/myrepo');
  assert.equal(await inferRepoFromGit({ execFileImpl: async () => { throw new Error('not a repo'); } }), undefined);
});

test('finds sources and extracts branches', () => {
  assert.equal(findSource([source], 'myorg/myrepo')?.name, source.name);
  assert.equal(findSource([source], source.id)?.name, source.name);
  assert.equal(findSource([source], source.name)?.name, source.name);
  assert.deepEqual(branchNames(source), ['main', 'develop']);
  assert.equal(defaultBranch(source), 'main');
  assert.doesNotThrow(() => assertBranchAllowed(source, 'main'));
  assert.throws(() => assertBranchAllowed(source, 'missing'), /was not listed/);
});

test('resolveSource fetches exact resource names and lists repo selectors', async () => {
  const api = {
    getSource: async name => ({ ...source, name }),
    listSources: async () => [source]
  };
  const exact = await resolveSource(api, { source: source.name });
  assert.equal(exact.name, source.name);
  const byRepo = await resolveSource(api, { repo: 'https://github.com/myorg/myrepo' });
  assert.equal(byRepo.name, source.name);
});
