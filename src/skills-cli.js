import {spawnSync} from 'node:child_process';
import process from 'node:process';

export function runSkillsAdd(bin, source, args) {
  const needsShell = process.platform === 'win32' && bin.endsWith('.cmd');
  const result = spawnSync(bin, ['add', source, ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: needsShell
  });
  return !result.error && result.status === 0;
}
