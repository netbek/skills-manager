import {existsSync} from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, expect, test} from 'vitest';
import {
  defaultConfig,
  makeGitFixture,
  makeSandbox,
  removeSandbox,
  REPO_CLI,
  runSync,
  symlinkSyncSafe,
  writeConfig
} from './helpers.js';

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

function makeInstalledFixture() {
  makeGitFixture(sandbox);
  writeConfig(
    sandbox,
    '.agents/skills/find-skills/SKILL.md',
    [
      '---',
      'name: find-skills',
      'description: Installed find-skills',
      '---',
      'Installed.',
      ''
    ].join('\n')
  );
  symlinkSyncSafe(
    '../../.agents/skills/find-skills',
    path.join(sandbox, '.claude', 'skills', 'find-skills')
  );
  symlinkSyncSafe(
    './nope',
    path.join(sandbox, '.claude', 'skills', 'dangling-link')
  );
  writeConfig(sandbox, '.skills.checksum', 'deadbeef\ndeadbeef\n');
  writeConfig(sandbox, 'skills-lock.json', '{}\n');
}

test('uninstall removes ignored skills and links, spares committed ones, drops state', () => {
  makeInstalledFixture();

  const first = run(['--root', sandbox, 'uninstall']);
  expect(first.status).toBe(0);

  expect(first.stderr).toContain('uninstalling excess skill: find-skills');
  expect(first.stderr).toContain('uninstalling excess skill link: find-skills');

  expect(
    existsSync(path.join(sandbox, '.agents', 'skills', 'find-skills'))
  ).toBe(false);
  expect(
    existsSync(path.join(sandbox, '.claude', 'skills', 'find-skills'))
  ).toBe(false);
  expect(
    existsSync(path.join(sandbox, '.claude', 'skills', 'dangling-link'))
  ).toBe(false);
  expect(existsSync(path.join(sandbox, '.skills.checksum'))).toBe(false);
  expect(existsSync(path.join(sandbox, 'skills-lock.json'))).toBe(false);

  expect(
    existsSync(path.join(sandbox, '.agents', 'skills', 'fp-skill', 'SKILL.md'))
  ).toBe(true);
  expect(
    existsSync(path.join(sandbox, '.claude', 'skills', 'committed-link'))
  ).toBe(true);

  const second = run(['--root', sandbox, 'uninstall']);
  expect(second.status).toBe(0);
  expect(second.stderr).toBe('');
  expect(
    existsSync(path.join(sandbox, '.agents', 'skills', 'fp-skill', 'SKILL.md'))
  ).toBe(true);
});

test('uninstall outside a git work tree refuses to remove anything', () => {
  defaultConfig(sandbox);
  writeConfig(sandbox, '.agents/skills/keep/SKILL.md', 'x\n');
  symlinkSyncSafe(
    '../.agents/skills/keep',
    path.join(sandbox, '.claude', 'skills-link')
  );
  writeConfig(sandbox, '.skills.checksum', 'hash\nhash\n');
  writeConfig(sandbox, 'skills-lock.json', '{}\n');

  const {status, stderr} = run(['--root', sandbox, 'uninstall']);
  expect(status).toBe(0);
  expect(stderr).toContain(
    'warning: outside a git work tree; refusing to uninstall any skills'
  );

  expect(
    existsSync(path.join(sandbox, '.agents', 'skills', 'keep', 'SKILL.md'))
  ).toBe(true);
  expect(existsSync(path.join(sandbox, '.claude', 'skills-link'))).toBe(true);
  expect(existsSync(path.join(sandbox, '.skills.checksum'))).toBe(true);
  expect(existsSync(path.join(sandbox, 'skills-lock.json'))).toBe(true);
});

test('uninstall still requires a config file', () => {
  const {status, stderr} = run(['--root', sandbox, 'uninstall']);
  expect(status).toBe(1);
  expect(stderr).toBe(`error: no config at ${sandbox}/skills.yaml\n`);
});
