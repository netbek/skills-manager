import {spawnSync} from 'node:child_process';

export function isInsideWorkTree() {
  return (
    spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
      stdio: 'ignore'
    }).status === 0
  );
}

export function checkIgnore(p) {
  return (
    spawnSync('git', ['check-ignore', '-q', p], {stdio: 'ignore'}).status === 0
  );
}
