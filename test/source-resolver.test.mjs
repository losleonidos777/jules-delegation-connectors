import test from 'node:test';
import assert from 'node:assert/strict';
import { findSource, normalizeRepo, branchNames } from '../src/source-resolver.mjs';

const sources = [
  {
    name: 'sources/github-myorg-myrepo',
    id: 'github-myorg-myrepo',
    githubRepo: {
      owner: 'myorg',
      repo: 'myrepo',
      defaultBranch: { displayName: 'main' },
      branches: [{ displayName: 'main' }, { displayName: 'develop' }]
    }
  }
];

test('normalizes github urls and owner/repo selectors', () => {
  assert.equal(normalizeRepo('https://github.com/myorg/myrepo.git'), 'myorg/myrepo');
  assert.equal(normalizeRepo('myorg/myrepo'), 'myorg/myrepo');
});

test('finds sources by repo, id, and name', () => {
  assert.equal(findSource(sources, 'myorg/myrepo')?.name, 'sources/github-myorg-myrepo');
  assert.equal(findSource(sources, 'github-myorg-myrepo')?.name, 'sources/github-myorg-myrepo');
  assert.equal(findSource(sources, 'sources/github-myorg-myrepo')?.name, 'sources/github-myorg-myrepo');
});

test('extracts branch names', () => {
  assert.deepEqual(branchNames(sources[0]), ['main', 'develop']);
});
