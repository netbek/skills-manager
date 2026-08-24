import {
  accessSync,
  constants,
  existsSync,
  realpathSync,
  statSync
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function isExecutableFile(p) {
  try {
    accessSync(p, constants.X_OK);
  } catch {
    return false;
  }
  return isFile(p);
}

export function findRoot() {
  const start = process.cwd();
  let dir = start;
  for (;;) {
    if (
      existsSync(path.join(dir, '.git')) ||
      isFile(path.join(dir, 'package.json'))
    ) {
      return dir;
    }
    const root = path.parse(dir).root;
    if (dir === root) {
      return start;
    }
    dir = path.dirname(dir);
  }
}

function binNames() {
  return process.platform === 'win32' ? ['skills.cmd', 'skills'] : ['skills'];
}

export function findSkillsBin(rootDir) {
  for (const name of binNames()) {
    const candidate = path.join(rootDir, 'node_modules', '.bin', name);
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }
  const origin = scriptDir();
  if (!origin) {
    return null;
  }
  let dir = origin;
  for (;;) {
    for (const name of binNames()) {
      const candidate = path.join(dir, 'node_modules', '.bin', name);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
    const root = path.parse(dir).root;
    if (dir === root) {
      return null;
    }
    dir = path.dirname(dir);
  }
}

export function scriptDir() {
  try {
    return path.dirname(realpathSync(process.argv[1]));
  } catch {
    return null;
  }
}
