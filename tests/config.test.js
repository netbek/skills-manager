import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {
  makeSandbox,
  removeSandbox,
  REPO_CLI,
  runSync,
  writeConfig
} from './helpers.js';

const STARTER_GOLDEN = [
  '# Docs: https://github.com/netbek/skills-manager',
  '',
  '# Agents receiving installs; each name is passed to the skills CLI',
  '# as an -a flag:',
  'agents:',
  '  - opencode',
  '  - claude-code',
  '',
  '# Directories the CLI fills with skill directories. At least one is required;',
  '# git-ignored entries absent from the list below are pruned:',
  'skills-dirs:',
  '  - .agents/skills',
  '',
  '# Directories of links into the first skills-dirs entry. Dangling or excess',
  '# git-ignored entries are pruned; committed first-party skills get refreshed',
  '# links here:',
  'links-dirs:',
  '  - .claude/skills',
  '',
  '# Third-party skills. Each entry needs a repo, an optional ref,',
  '# and at least one skill:',
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

describe('skills-manager.yaml validation', () => {
  test('unknown top-level key errors and exits 1', () => {
    writeConfig(
      sandbox,
      'skills-manager.yaml',
      'skill_dirs:\n  - .agents/skills\n'
    );
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills-manager.yaml: unknown key 'skill_dirs'\n`
    );
  });

  test('missing skills-dirs errors and exits 1', () => {
    writeConfig(sandbox, 'skills-manager.yaml', 'agents:\n  - opencode\n');
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills-manager.yaml declares no skills-dirs\n`
    );
  });

  test('empty skills-dirs list errors and exits 1', () => {
    writeConfig(sandbox, 'skills-manager.yaml', 'skills-dirs: []\n');
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills-manager.yaml declares no skills-dirs\n`
    );
  });

  test('repo entry without skills errors and exits 1', () => {
    writeConfig(
      sandbox,
      'skills-manager.yaml',
      [
        'skills-dirs:',
        '  - .agents/skills',
        'repos:',
        '  - repo: owner/repo',
        ''
      ].join('\n')
    );
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills-manager.yaml: repos[0].skills must list at least one skill\n`
    );
  });

  test('repo entry with unknown key errors and exits 1', () => {
    writeConfig(
      sandbox,
      'skills-manager.yaml',
      [
        'skills-dirs:',
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
      `error: ${sandbox}/skills-manager.yaml: repos[0]: unknown key 'branch'\n`
    );
  });

  test('invalid YAML syntax errors and exits 1', () => {
    writeConfig(sandbox, 'skills-manager.yaml', 'skills-dirs: [unclosed\n');
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr.startsWith(`error: ${sandbox}/skills-manager.yaml:`)).toBe(
      true
    );
  });

  test('non-mapping top level errors and exits 1', () => {
    writeConfig(sandbox, 'skills-manager.yaml', '- just\n- a\n- list\n');
    const {status, stderr} = run(['--root', sandbox, 'install']);
    expect(status).toBe(1);
    expect(stderr).toBe(
      `error: ${sandbox}/skills-manager.yaml: top level must be a mapping\n`
    );
  });
});
