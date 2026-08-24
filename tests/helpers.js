import {spawnSync} from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
export const REPO_CLI = path.join(REPO_ROOT, 'bin', 'skills-sync.js');

export function makeSandbox() {
  return mkdtempSync(path.join(os.tmpdir(), 'skills-sync-test-'));
}

export function removeSandbox(sandbox) {
  if (sandbox) {
    rmSync(sandbox, {recursive: true, force: true});
  }
}

export function writeConfig(sandbox, relative, contents) {
  const file = path.join(sandbox, relative);
  mkdirSync(path.dirname(file), {recursive: true});
  writeFileSync(file, contents);
}

export const DEFAULT_CONFIG = [
  'agents:',
  '  - opencode',
  '  - claude-code',
  'skills_dir:',
  '  - .agents/skills',
  'links_dir:',
  '  - .claude/skills',
  '',
  'repos:',
  '  - repo: vercel-labs/skills',
  '    skills:',
  '      - find-skills',
  ''
].join('\n');

export function defaultConfig(sandbox) {
  writeConfig(sandbox, 'skills.yaml', DEFAULT_CONFIG);
}

function runGit(args, cwd) {
  const result = spawnSync('git', args, {cwd, stdio: 'ignore'});
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}`);
  }
}

export function makeGitFixture(sandbox) {
  defaultConfig(sandbox);
  writeConfig(
    sandbox,
    '.gitignore',
    [
      '.agents/skills/*',
      '.claude/skills/*',
      '!.agents/skills/fp-skill',
      '!.claude/skills/committed-link',
      '.skills.checksum',
      'skills-lock.json',
      ''
    ].join('\n')
  );
  writeSkill(
    sandbox,
    '.agents/skills/fp-skill',
    [
      '---',
      'name: fp-skill',
      'description: First party skill',
      '---',
      'Use me directly.',
      ''
    ].join('\n')
  );
  mkdirSync(path.join(sandbox, '.claude', 'skills'), {recursive: true});
  symlinkSync(
    '../../.agents/skills/fp-skill',
    path.join(sandbox, '.claude', 'skills', 'committed-link')
  );
  runGit(['init', '-q', '-b', 'main'], sandbox);
  runGit(['config', 'user.email', 'test@example.com'], sandbox);
  runGit(['config', 'user.name', 'Test'], sandbox);
  runGit(['add', '-A'], sandbox);
  runGit(['commit', '-qm', 'init'], sandbox);
}

export function writeSkill(sandbox, skillDir, contents) {
  writeConfig(sandbox, path.join(skillDir, 'SKILL.md'), contents);
}

export function symlinkSyncSafe(target, link) {
  mkdirSync(path.dirname(link), {recursive: true});
  try {
    rmSync(link);
  } catch {}
  symlinkSync(target, link);
}

const STUB_SOURCE = [
  '#!/usr/bin/env node',
  "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
  "import path from 'node:path';",
  '',
  'const args = process.argv.slice(2);',
  'if (process.env.STUB_LOG) {',
  "    appendFileSync(process.env.STUB_LOG, `ARGS=${args.join(' ')}\\n`);",
  '}',
  'const skillsDir = process.env.STUB_SKILLS_DIR;',
  'if (skillsDir) {',
  '    let prev;',
  '    for (const arg of args) {',
  "        if (prev === '--skill') {",
  '            mkdirSync(path.join(skillsDir, arg), { recursive: true });',
  '            writeFileSync(',
  '                path.join(skillsDir, arg, "SKILL.md"),',
  '                `---\\nname: ${arg}\\ndescription: Installed ${arg}\\n---\\nInstalled.\\n`,',
  '            );',
  '        }',
  '        prev = arg;',
  '    }',
  '}',
  'process.exit(Number(process.env.STUB_EXIT ?? 0));',
  ''
].join('\n');

export function stubSkills(sandbox) {
  const binDir = path.join(sandbox, 'node_modules', '.bin');
  mkdirSync(binDir, {recursive: true});
  const stub = path.join(binDir, 'skills');
  writeFileSync(stub, STUB_SOURCE);
  chmodSync(stub, 0o755);
  const log = path.join(sandbox, 'skills-calls.log');
  writeFileSync(log, '');
  return log;
}

export function copyCliIntoSandbox(sandbox) {
  cpSync(path.join(REPO_ROOT, 'bin'), path.join(sandbox, 'bin'), {
    recursive: true
  });
  cpSync(path.join(REPO_ROOT, 'src'), path.join(sandbox, 'src'), {
    recursive: true
  });
  const modulesDir = path.join(sandbox, 'node_modules');
  mkdirSync(modulesDir, {recursive: true});
  symlinkSync(
    path.join(REPO_ROOT, 'node_modules', 'yaml'),
    path.join(modulesDir, 'yaml'),
    'dir'
  );
  return path.join(sandbox, 'bin', 'skills-sync.js');
}

export function runSync(sandbox, entry, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd: sandbox,
    encoding: 'utf8',
    env: {...process.env, ...extraEnv},
    input: ''
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}
