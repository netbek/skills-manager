import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync
} from 'node:fs';
import path from 'node:path';
import {checkIgnore} from './git.js';

function warn(message) {
  console.error(message);
}

function canonical(p) {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export function refreshLinks(names, linksDirs, skillsDir) {
  const skillsBase = canonical(skillsDir);
  for (const name of names) {
    for (const linksDir of linksDirs) {
      const target = `${path.relative(
        canonical(linksDir),
        skillsBase
      )}/${name}`;
      const link = `${linksDir}/${name}`;
      rmIfExists(link);
      symlinkSync(target, link, 'dir');
    }
  }
}

function rmIfExists(p) {
  try {
    lstatSync(p);
  } catch {
    return;
  }
  rmSync(p, {recursive: true, force: true});
}

export function pruneLinks(desired, linksDirs) {
  for (const linksDir of linksDirs) {
    let entries;
    try {
      entries = readdirSync(linksDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.startsWith('.')) {
        continue;
      }
      const full = `${linksDir}/${entry}`;
      let st;
      try {
        st = lstatSync(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink() && !existsSync(full)) {
        warn(`removing dangling skill link: ${entry}`);
      } else if (checkIgnore(full) && !desired.has(entry)) {
        warn(`uninstalling excess skill link: ${entry}`);
      } else {
        continue;
      }
      rmSync(full, {recursive: true, force: true});
    }
  }
}

export function pruneSkillDirs(desired, skillsDirs) {
  for (const skillsDir of skillsDirs) {
    let entries;
    try {
      entries = readdirSync(skillsDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith('.')) {
        continue;
      }
      const full = `${skillsDir}/${name}`;
      let isDir;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (!isDir || !checkIgnore(full)) {
        continue;
      }
      if (!desired.has(name)) {
        warn(`uninstalling excess skill: ${name}`);
        rmSync(full, {recursive: true, force: true});
      }
    }
  }
}
