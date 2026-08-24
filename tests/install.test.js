import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {
  copyCliIntoSandbox,
  defaultConfig,
  makeGitFixture,
  makeSandbox,
  removeSandbox,
  REPO_CLI,
  runSync,
  stubSkills,
  writeConfig
} from './helpers.js';

let sandbox;
let log;

beforeEach(() => {
  sandbox = makeSandbox();
});

afterEach(() => {
  removeSandbox(sandbox);
  sandbox = undefined;
  log = undefined;
});

function stub({materialize = false} = {}) {
  log = stubSkills(sandbox);
  return materialize
    ? {
        STUB_LOG: log,
        STUB_SKILLS_DIR: path.join(sandbox, '.agents', 'skills')
      }
    : {STUB_LOG: log};
}

function run(args, env = {}) {
  return runSync(sandbox, REPO_CLI, args, env);
}

const calls = () =>
  readFileSync(log, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('ARGS='));

test('install passes agents, -y and each skill to the CLI, run from the root', () => {
  makeGitFixture(sandbox);
  const env = stub({materialize: true});

  const {status, stderr} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(0);
  expect(stderr).toBe('');

  expect(calls()).toEqual([
    'ARGS=add vercel-labs/skills -a opencode -a claude-code -y --skill find-skills'
  ]);
  expect(
    existsSync(
      path.join(sandbox, '.agents', 'skills', 'find-skills', 'SKILL.md')
    )
  ).toBe(true);
});

test('install makes one CLI invocation per repo entry and repeats --skill within an entry', () => {
  makeGitFixture(sandbox);
  writeConfig(
    sandbox,
    'skills-sync.yaml',
    [
      'agents:',
      '  - opencode',
      '  - claude-code',
      'skills-dirs:',
      '  - .agents/skills',
      'links-dirs:',
      '  - .claude/skills',
      'repos:',
      '  - repo: repo/a',
      '    skills:',
      '      - alpha',
      '      - beta',
      '  - repo: repo/b',
      '    skills:',
      '      - gamma',
      ''
    ].join('\n')
  );
  const env = stub();

  const {status} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(0);

  expect(calls()).toEqual([
    'ARGS=add repo/a -a opencode -a claude-code -y --skill alpha --skill beta',
    'ARGS=add repo/b -a opencode -a claude-code -y --skill gamma'
  ]);
});

test('install creates every declared skills-dirs and links-dirs', () => {
  makeGitFixture(sandbox);
  writeConfig(
    sandbox,
    'skills-sync.yaml',
    [
      'agents:',
      '  - opencode',
      'skills-dirs:',
      '  - .agents/skills',
      '  - .other/skills',
      'links-dirs:',
      '  - .claude/skills',
      '  - .codex/skills',
      'repos:',
      '  - repo: repo/a',
      '    skills:',
      '      - alpha',
      ''
    ].join('\n')
  );
  const env = stub();

  const {status} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(0);

  for (const dir of [
    '.agents/skills',
    '.other/skills',
    '.claude/skills',
    '.codex/skills'
  ]) {
    expect(existsSync(path.join(sandbox, dir)), dir).toBe(true);
  }
});

test('install records config and first-party hashes in the checksum file', () => {
  makeGitFixture(sandbox);
  const env = stub({materialize: true});

  const {status} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(0);

  const checksum = readFileSync(
    path.join(sandbox, 'node_modules', '.skills-sync.checksum'),
    'utf8'
  );
  const hash = createHash('sha256')
    .update(readFileSync(path.join(sandbox, 'skills-sync.yaml')))
    .digest('hex');
  const fpHash = createHash('sha256')
    .update('fp-skill\n', 'utf8')
    .digest('hex');
  expect(checksum).toBe(`${hash}\n${fpHash}\n`);
});

test('unchanged rerun is a no-op', () => {
  makeGitFixture(sandbox);
  const env = stub({materialize: true});

  expect(run(['--root', sandbox, 'install'], env).status).toBe(0);
  expect(calls()).toHaveLength(1);

  const rerun = run(['--root', sandbox, 'install'], env);
  expect(rerun.status).toBe(0);
  expect(rerun.stderr).toBe('');
  expect(calls()).toHaveLength(1);
});

test('--force reinstalls despite matching checksum', () => {
  makeGitFixture(sandbox);
  const env = stub({materialize: true});

  expect(run(['--root', sandbox, 'install'], env).status).toBe(0);
  expect(run(['--root', sandbox, 'install', '--force'], env).status).toBe(0);
  expect(calls()).toHaveLength(2);
});

test('editing the config triggers a fresh pass covering both old and new entries', () => {
  makeGitFixture(sandbox);
  const env = stub({materialize: true});

  expect(run(['--root', sandbox, 'install'], env).status).toBe(0);
  writeFileSync(
    path.join(sandbox, 'skills-sync.yaml'),
    `${readFileSync(
      path.join(sandbox, 'skills-sync.yaml'),
      'utf8'
    )}  - repo: other/repo\n    skills:\n      - delta\n`
  );

  expect(run(['--root', sandbox, 'install'], env).status).toBe(0);
  expect(calls()).toEqual([
    'ARGS=add vercel-labs/skills -a opencode -a claude-code -y --skill find-skills',
    'ARGS=add vercel-labs/skills -a opencode -a claude-code -y --skill find-skills',
    'ARGS=add other/repo -a opencode -a claude-code -y --skill delta'
  ]);
});

test('missing config file errors and exits 1', () => {
  const {status, stdout, stderr} = run(['--root', sandbox, 'install']);
  expect(status).toBe(1);
  expect(stderr).toBe(`error: no config at ${sandbox}/skills-sync.yaml\n`);
  expect(stdout).toBe('');
});

test('config declaring no skills-dirs errors and exits 1', () => {
  makeGitFixture(sandbox);
  writeConfig(
    sandbox,
    'skills-sync.yaml',
    [
      'agents:',
      '  - opencode',
      'links-dirs:',
      '  - .claude/skills',
      'repos:',
      '  - repo: repo/a',
      '    skills:',
      '      - alpha',
      ''
    ].join('\n')
  );
  const env = stub();

  const {status, stderr} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(1);
  expect(stderr).toBe(
    `error: ${sandbox}/skills-sync.yaml declares no skills-dirs\n`
  );
});

test('first-party skill is never reinstalled but gets refreshed links', () => {
  makeGitFixture(sandbox);
  writeConfig(
    sandbox,
    'skills-sync.yaml',
    [
      'agents:',
      '  - opencode',
      '  - claude-code',
      'skills-dirs:',
      '  - .agents/skills',
      'links-dirs:',
      '  - .claude/skills',
      'repos:',
      '  - repo: vercel-labs/skills',
      '    skills:',
      '      - find-skills',
      '      - fp-skill',
      ''
    ].join('\n')
  );
  const env = stub({materialize: true});

  const {status} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(0);

  expect(calls()).toEqual([
    'ARGS=add vercel-labs/skills -a opencode -a claude-code -y --skill find-skills'
  ]);

  const readlink = (p) => readlinkSync(p);
  expect(readlink(path.join(sandbox, '.claude', 'skills', 'fp-skill'))).toBe(
    '../../.agents/skills/fp-skill'
  );
  expect(
    readlink(path.join(sandbox, '.claude', 'skills', 'committed-link'))
  ).toBe('../../.agents/skills/fp-skill');
});

test('install prunes excess skills and links while sparing committed ones', () => {
  makeGitFixture(sandbox);
  writeConfig(
    sandbox,
    '.agents/skills/installed-old/SKILL.md',
    ['---', 'name: installed-old', 'description: Old', '---', 'gone', ''].join(
      '\n'
    )
  );
  symlinkSync(
    './nope',
    path.join(sandbox, '.claude', 'skills', 'dangling-link')
  );
  symlinkSync(
    '../../.agents/skills/fp-skill',
    path.join(sandbox, '.claude', 'skills', 'stale-link')
  );
  const env = stub({materialize: true});

  const {status, stderr} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(0);

  expect(stderr).toContain('uninstalling excess skill: installed-old');
  expect(stderr).toContain('removing dangling skill link: dangling-link');
  expect(stderr).toContain('uninstalling excess skill link: stale-link');

  expect(
    existsSync(path.join(sandbox, '.agents', 'skills', 'installed-old'))
  ).toBe(false);
  expect(
    existsSync(path.join(sandbox, '.claude', 'skills', 'dangling-link'))
  ).toBe(false);
  expect(
    existsSync(path.join(sandbox, '.claude', 'skills', 'stale-link'))
  ).toBe(false);

  expect(
    existsSync(path.join(sandbox, '.agents', 'skills', 'fp-skill', 'SKILL.md'))
  ).toBe(true);
  expect(
    existsSync(path.join(sandbox, '.claude', 'skills', 'committed-link'))
  ).toBe(true);
  expect(
    existsSync(
      path.join(sandbox, '.agents', 'skills', 'find-skills', 'SKILL.md')
    )
  ).toBe(true);
});

test('missing skills binary warns and exits 0 without installing', () => {
  makeGitFixture(sandbox);
  const entry = copyCliIntoSandbox(sandbox);

  const {status, stdout, stderr} = runSync(sandbox, entry, [
    '--root',
    sandbox,
    'install'
  ]);
  expect(status).toBe(0);
  expect(stdout).toBe('');
  expect(stderr).toBe(
    'warning: no skills binary here or beside skills-sync; install dependencies first\n'
  );
  expect(
    existsSync(path.join(sandbox, '.agents', 'skills', 'find-skills'))
  ).toBe(false);
  expect(
    existsSync(path.join(sandbox, '.claude', 'skills', 'find-skills'))
  ).toBe(false);
});

test('custom --config and --checksum paths are honored', () => {
  writeConfig(
    sandbox,
    'conf/my.conf',
    [
      'agents:',
      '  - opencode',
      'skills-dirs:',
      '  - .agents/skills',
      'links-dirs:',
      '  - .claude/skills',
      'repos:',
      '  - repo: repo/a',
      '    skills:',
      '      - alpha',
      ''
    ].join('\n')
  );
  const env = stub({materialize: true});

  const {status} = run(
    [
      '--root',
      sandbox,
      'install',
      '--config',
      'conf/my.conf',
      '--checksum',
      'state/checksums'
    ],
    env
  );
  expect(status).toBe(0);
  expect(calls()).toHaveLength(1);
  expect(existsSync(path.join(sandbox, 'state', 'checksums'))).toBe(true);
  expect(
    existsSync(path.join(sandbox, 'node_modules', '.skills-sync.checksum'))
  ).toBe(false);
});

test('warns when the checksum file is not git-ignored', () => {
  defaultConfig(sandbox);
  writeConfig(
    sandbox,
    '.gitignore',
    [
      '.agents/skills/*',
      '.claude/skills/*',
      '!.agents/skills/fp-skill',
      ''
    ].join('\n')
  );
  spawnSync('git', ['init', '-q', '-b', 'main'], {
    cwd: sandbox,
    stdio: 'ignore'
  });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], {
    cwd: sandbox,
    stdio: 'ignore'
  });
  spawnSync('git', ['config', 'user.name', 'Test'], {
    cwd: sandbox,
    stdio: 'ignore'
  });
  spawnSync('git', ['add', '-A'], {cwd: sandbox, stdio: 'ignore'});
  spawnSync('git', ['commit', '-qm', 'init'], {
    cwd: sandbox,
    stdio: 'ignore'
  });
  const env = stub();

  const {status, stderr} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(0);
  expect(stderr).toContain(
    'warning: add node_modules/.skills-sync.checksum to .gitignore'
  );
});

test('CLI failure warns but still exits 0', () => {
  makeGitFixture(sandbox);
  const env = stub();
  env.STUB_EXIT = '1';

  const {status, stdout, stderr} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(0);
  expect(stderr).toContain(
    'warning: could not install skills from vercel-labs/skills (offline?)'
  );
  expect(stderr).toContain(
    'warning: some skills failed to install; check your connection and rerun'
  );
  expect(stdout).toBe('');
});

test('install works outside a git work tree', () => {
  defaultConfig(sandbox);
  const env = stub({materialize: true});

  const {status, stdout} = run(['--root', sandbox, 'install'], env);
  expect(status).toBe(0);
  expect(stdout).toBe('');
  expect(calls()).toHaveLength(1);
  expect(
    existsSync(
      path.join(sandbox, '.agents', 'skills', 'find-skills', 'SKILL.md')
    )
  ).toBe(true);
});

describe('scalar shorthand and refs', () => {
  test('scalar agents and skills-dirs coerce to single-element lists', () => {
    writeConfig(
      sandbox,
      'skills-sync.yaml',
      [
        'agents: opencode',
        'skills-dirs: .agents/skills',
        'repos:',
        '  - repo: repo/a',
        '    skills: alpha',
        ''
      ].join('\n')
    );
    const env = stub();

    const {status, stderr} = run(['--root', sandbox, 'install'], env);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(calls()).toEqual(['ARGS=add repo/a -a opencode -y --skill alpha']);
  });

  test('repo ref is passed to the CLI as repo#ref', () => {
    writeConfig(
      sandbox,
      'skills-sync.yaml',
      [
        'agents:',
        '  - opencode',
        'skills-dirs:',
        '  - .agents/skills',
        'repos:',
        '  - repo: vercel-labs/skills',
        '    ref: v1.2.3',
        '    skills:',
        '      - find-skills',
        ''
      ].join('\n')
    );
    const env = stub();

    const {status, stderr} = run(['--root', sandbox, 'install'], env);
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(calls()).toEqual([
      'ARGS=add vercel-labs/skills#v1.2.3 -a opencode -y --skill find-skills'
    ]);
  });
});
