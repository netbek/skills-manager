import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {
  makeSandbox,
  removeSandbox,
  REPO_CLI,
  runSync,
  writeConfig,
  writeSkill
} from './helpers.js';

let sandbox;

beforeEach(() => {
  sandbox = makeSandbox();
  writeConfig(
    sandbox,
    'skills.yaml',
    ['skills-dir:', '  - .agents/skills', ''].join('\n')
  );
});

afterEach(() => {
  removeSandbox(sandbox);
  sandbox = undefined;
});

function run(args) {
  return runSync(sandbox, REPO_CLI, args);
}

const skill = (dir, name, description) => {
  writeSkill(
    sandbox,
    dir,
    [
      `---`,
      `name: ${name}`,
      `description: ${description}`,
      `---`,
      `Body of ${name}.`,
      ''
    ].join('\n')
  );
};

describe('agents-md', () => {
  test('renders header prose with the skills dir substituted and no table when empty', () => {
    mkdirSync(path.join(sandbox, '.agents', 'skills'), {recursive: true});

    const {status, stdout} = run(['--root', sandbox, 'agents-md']);
    expect(status).toBe(0);

    expect(stdout).toContain('# AGENTS.md');
    expect(stdout).toContain('## Project skills');
    expect(stdout).toContain('read .agents/skills/find-skills/SKILL.md');
    expect(stdout).not.toContain('{SKILLS_DIR}');
    expect(stdout).not.toContain('|-------|');
  });

  test('renders a table row per first-party skill with names and descriptions', () => {
    skill('.agents/skills/alpha', 'alpha', 'Alpha does things');
    skill('.agents/skills/beta', 'beta', 'Beta | escapes pipes');

    const {status, stdout} = run(['--root', sandbox, 'agents-md']);
    expect(status).toBe(0);

    expect(stdout).toContain('| Skill | Path | Description |');
    expect(stdout).toContain(
      '| `alpha` | `.agents/skills/alpha` | Alpha does things |'
    );
    expect(stdout).toContain(
      '| `beta` | `.agents/skills/beta` | Beta \\| escapes pipes |'
    );
  });

  test('renders one section per package that ships skills, none for bare packages', () => {
    skill('node_modules/pkg-a/skills/wizard', 'wizard', 'Wizard casts spells');
    skill(
      'node_modules/@scope/pkg-b/skills/gadget',
      'gadget',
      'Gadget tinkers'
    );
    writeConfig(sandbox, 'node_modules/pkg-c/lib/placeholder.txt', '');

    const {status, stdout} = run(['--root', sandbox, 'agents-md']);
    expect(status).toBe(0);

    expect(stdout).toContain('## Package skills: pkg-a');
    expect(stdout).toContain(
      'The `pkg-a` package ships skills under `node_modules/pkg-a/skills/`.'
    );
    expect(stdout).toContain('read node_modules/pkg-a/skills/wizard/SKILL.md');
    expect(stdout).toContain(
      '| `wizard` | `node_modules/pkg-a/skills/wizard` | Wizard casts spells |'
    );

    expect(stdout).toContain('## Package skills: @scope/pkg-b');
    expect(stdout).toContain(
      'read node_modules/@scope/pkg-b/skills/gadget/SKILL.md'
    );

    expect(stdout).not.toContain('pkg-c');
  });

  test('folds multiline descriptions and falls back to folder names', () => {
    writeSkill(
      sandbox,
      '.agents/skills/gamma',
      [
        '---',
        'description: >',
        '  Folded one.',
        '  Folded two.',
        '---',
        'Body.',
        ''
      ].join('\n')
    );
    writeSkill(sandbox, '.agents/skills/delta', 'Plain body.\n');

    const {status, stdout} = run(['--root', sandbox, 'agents-md']);
    expect(status).toBe(0);

    expect(stdout).toContain(
      '| `gamma` | `.agents/skills/gamma` | Folded one. Folded two. |'
    );
    expect(stdout).toContain('| `delta` | `.agents/skills/delta` |  |');
  });
});
