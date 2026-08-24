import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {checkIgnore, isInsideWorkTree} from './git.js';
import {findSkillsBin} from './paths.js';
import {pruneLinks, pruneSkillDirs, refreshLinks} from './prune.js';
import {runSkillsAdd} from './skills-cli.js';
import {sha256File, sha256String} from './sha.js';

function warn(message) {
  console.error(message);
}

export function firstPartyNames(skillsDir) {
  const names = [];
  let entries;
  try {
    entries = readdirSync(skillsDir);
  } catch {
    return names;
  }
  for (const name of entries) {
    if (name.startsWith('.')) {
      continue;
    }
    try {
      if (!statSync(`${skillsDir}/${name}`).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }
    if (!checkIgnore(`${skillsDir}/${name}`)) {
      names.push(name);
    }
  }
  return names.sort();
}

export function install({force, cfg, checksumFile}) {
  const skillsDir = cfg.skillsDirs[0];
  const guard = isInsideWorkTree();
  const firstParty = guard ? firstPartyNames(skillsDir) : [];

  const hash = sha256File(cfg.path);
  const fpHash = sha256String(firstParty.map((name) => `${name}\n`).join(''));
  if (
    !force &&
    checksumContains(checksumFile, hash) &&
    checksumContains(checksumFile, fpHash) &&
    cfg.skillsDirs.every((dir) => isDirectory(dir))
  ) {
    return 0;
  }

  const bin = findSkillsBin(process.cwd());
  if (!bin) {
    warn(
      'warning: no skills binary here or beside skills-manager; install dependencies first'
    );
    return 0;
  }

  for (const dir of [...cfg.skillsDirs, ...cfg.linksDirs]) {
    mkdirSync(dir, {recursive: true});
  }

  const agentArgs = cfg.agents.flatMap((agent) => ['-a', agent]);
  const desired = [];
  let failed = false;
  for (const entry of cfg.repos) {
    const args = [...agentArgs, '-y'];
    let selected = 0;
    for (const skill of entry.skills) {
      const dest = `${skillsDir}/${skill}`;
      if (guard && isDirectory(dest) && !checkIgnore(dest)) {
        continue;
      }
      args.push('--skill', skill);
      desired.push(skill);
      selected++;
    }
    if (selected === 0) {
      continue;
    }
    const source = entry.ref ? `${entry.repo}#${entry.ref}` : entry.repo;
    if (!runSkillsAdd(bin, source, args)) {
      warn(`warning: could not install skills from ${source} (offline?)`);
      failed = true;
    }
  }

  for (const name of firstParty) {
    refreshLinks([name], cfg.linksDirs, skillsDir);
    desired.push(name);
  }

  const desiredSet = new Set(desired);
  pruneLinks(desiredSet, cfg.linksDirs);
  pruneSkillDirs(desiredSet, cfg.skillsDirs);

  mkdirSync(path.dirname(checksumFile), {recursive: true});
  writeFileSync(checksumFile, `${hash}\n${fpHash}\n`);

  if (guard && !checkIgnore(checksumFile)) {
    warn(`warning: add ${checksumFile} to .gitignore`);
  }
  if (failed) {
    warn(
      'warning: some skills failed to install; check your connection and rerun'
    );
  }
  return 0;
}

function checksumContains(checksumFile, value) {
  if (!existsSync(checksumFile)) {
    return false;
  }
  try {
    return readFileSync(checksumFile, 'utf8').split('\n').includes(value);
  } catch {
    return false;
  }
}

function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
