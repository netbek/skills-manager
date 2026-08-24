import {afterEach, beforeEach, expect, test} from 'vitest';
import {makeSandbox, removeSandbox, runSync, REPO_CLI} from './helpers.js';

const USAGE_GOLDEN = [
  'usage: skills-sync config',
  '       skills-sync install [--force] [--config FILE] [--root DIR] [--checksum FILE]',
  '       skills-sync uninstall [--config FILE] [--root DIR] [--checksum FILE]',
  '       skills-sync agents-md [--config FILE] [--root DIR]',
  ''
].join('\n');

let sandbox;

beforeEach(() => {
  sandbox = makeSandbox();
});

afterEach(() => {
  removeSandbox(sandbox);
  sandbox = undefined;
});

function run(args) {
  return runSync(sandbox, REPO_CLI, args);
}

test('no command prints usage to stderr and exits 1', () => {
  const {status, stdout, stderr} = run([]);
  expect(status).toBe(1);
  expect(stdout).toBe('');
  expect(stderr).toBe(USAGE_GOLDEN);
});

test('unknown command prints usage and exits 1', () => {
  const {status, stdout, stderr} = run(['deploy']);
  expect(status).toBe(1);
  expect(stdout).toBe('');
  expect(stderr).toContain('usage: skills-sync config');
  expect(stderr).toBe(USAGE_GOLDEN);
});

test('unknown flag prints usage and exits 1', () => {
  const {status, stderr} = run(['install', '--frobnicate']);
  expect(status).toBe(1);
  expect(stderr).toBe(USAGE_GOLDEN);
});

test('second command prints usage and exits 1', () => {
  const {status, stderr} = run(['config', 'uninstall']);
  expect(status).toBe(1);
  expect(stderr).toBe(USAGE_GOLDEN);
});

test('missing option value prints usage and exits 1', () => {
  for (const args of [
    ['install', '--config'],
    ['uninstall', '--root'],
    ['install', '--checksum']
  ]) {
    const {status, stderr} = run(args);
    expect(status).toBe(1);
    expect(stderr).toBe(USAGE_GOLDEN);
  }
});
