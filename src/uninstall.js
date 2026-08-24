import {rmSync} from 'node:fs';
import {LOCK_FILE} from './constants.js';
import {isInsideWorkTree} from './git.js';
import {pruneLinks, pruneSkillDirs} from './prune.js';

export function uninstall({cfg, checksumFile}) {
  if (!isInsideWorkTree()) {
    console.error(
      'warning: outside a git work tree; refusing to uninstall any skills'
    );
    return 0;
  }
  pruneLinks(new Set(), cfg.linksDirs);
  pruneSkillDirs(new Set(), cfg.skillsDirs);
  rmSync(checksumFile, {force: true});
  rmSync(LOCK_FILE, {force: true});
  return 0;
}
