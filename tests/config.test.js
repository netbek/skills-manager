import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {
  makeSandbox,
  removeSandbox,
  REPO_CLI,
  runSync,
  writeConfig
} from './helpers.js';

const STARTER_GOLDEN = [
  '# Docs: https://github.com/netbek/skills-sync',
  '',
  '# Agents receiving installs; each name is passed to the skills CLI as an -a flag:',
  'agents:',
  '  - opencode',
  '  - claude-code',
  '',
  '# Directories the CLI fills with skill folders. At least one is required; git-ignored',
  '# entries absent from the list below are pruned:',
  'skills_dir:',
  '  - .agents/skills',
  '',
  '# Directories of links into the first skills_dir. Dangling or excess git-ignored',
  '# entries are pruned; committed first-party skills get refreshed links here:',
  'links_dir:',
  '  - .claude/skills',
  '',
  '# Third-party skills. Each entry needs a repo, an optional ref, and at least one skill:',
  'repos:',
  '  - repo: vercel-labs/skills',
  '    # ref: v1.2.3',
  '    skills:',
  '      - find-skills',
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

test('config prints the starter config to stdout and exits 0', () => {
  const {status, stdout, stderr} = run(['--root', sandbox, 'config']);
  expect(status).toBe(0);
  expect(stdout).toBe(STARTER_GOLDEN);
  expect(stderr).toBe('');
});

test('config works without a config file, git repo or skills binary', () => {
  const {status, stdout, stderr} = run(['--root', sandbox, 'config']);
  expect(status).toBe(0);
  expect(stdout).toBe(STARTER_GOLDEN);
  expect(stderr).toBe('');
});

describe('skills.yaml validation', () => {
  test('unknown top-level key errors and exits 1', () => {
    writeConfig(sandbox, 'skills.yaml', 'skill_dirs:\n  - .agents/skills\n');
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills.yaml: unknown key 'skill_dirs'\n`
    );
  });

  test('missing skills_dir errors and exits 1', () => {
    writeConfig(sandbox, 'skills.yaml', 'agents:\n  - opencode\n');
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills.yaml declares no skills_dir\n`
    );
  });

  test('empty skills_dir list errors and exits 1', () => {
    writeConfig(sandbox, 'skills.yaml', 'skills_dir: []\n');
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills.yaml declares no skills_dir\n`
    );
  });

  test('repo entry without skills errors and exits 1', () => {
    writeConfig(
      sandbox,
      'skills.yaml',
      [
        'skills_dir:',
        '  - .agents/skills',
        'repos:',
        '  - repo: owner/repo',
        ''
      ].join('\n')
    );
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills.yaml: repos[0].skills must list at least one skill\n`
    );
  });

  test('repo entry with unknown key errors and exits 1', () => {
    writeConfig(
      sandbox,
      'skills.yaml',
      [
        'skills_dir:',
        '  - .agents/skills',
        'repos:',
        '  - repo: owner/repo',
        '    skills:',
        '      - alpha',
        '    branch: main',
        ''
      ].join('\n')
    );
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills.yaml: repos[0]: unknown key 'branch'\n`
    );
  });

  test('invalid YAML syntax errors and exits 1', () => {
    writeConfig(sandbox, 'skills.yaml', 'skills_dir: [unclosed\n');
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr.startsWith(`error: ${sandbox}/skills.yaml:`)).toBe(true);
  });

  test('non-mapping top level errors and exits 1', () => {
    writeConfig(sandbox, 'skills.yaml', '- just\n- a\n- list\n');
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills.yaml: top level must be a mapping\n`
    );
  });
});
