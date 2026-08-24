import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {parseFrontmatter} from './frontmatter.js';

function skillFolders(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const folders = [];
  for (const name of entries) {
    if (name.startsWith('.')) {
      continue;
    }
    try {
      if (!statSync(path.join(dir, name)).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }
    folders.push(name);
  }
  return folders.sort();
}

function hasSkillMd(dir, folder) {
  try {
    return statSync(path.join(dir, folder, 'SKILL.md')).isFile();
  } catch {
    return false;
  }
}

export function hasSkills(dir) {
  return skillFolders(dir).some((folder) => hasSkillMd(dir, folder));
}

export function firstSkillName(dir) {
  for (const folder of skillFolders(dir)) {
    if (!hasSkillMd(dir, folder)) {
      continue;
    }
    const fm = parseFrontmatter(
      readFileSync(path.join(dir, folder, 'SKILL.md'), 'utf8')
    );
    return fm.name || folder;
  }
  return null;
}

export function emitSkillsTable(dir) {
  const rows = [
    '| Skill | Path | Description |',
    '|-------|------|-------------|'
  ];
  for (const folder of skillFolders(dir)) {
    if (!hasSkillMd(dir, folder)) {
      continue;
    }
    const fm = parseFrontmatter(
      readFileSync(path.join(dir, folder, 'SKILL.md'), 'utf8')
    );
    const name = fm.name || folder;
    const description = fm.description.replace(/\|/g, '\\|');
    rows.push(`| \`${name}\` | \`${dir}/${folder}\` | ${description} |`);
  }
  return rows;
}

export function discoverPackages() {
  const found = new Set();
  let top;
  try {
    top = readdirSync('node_modules');
  } catch {
    return [];
  }
  for (const entry of top) {
    if (entry.startsWith('@')) {
      let scoped;
      try {
        scoped = readdirSync(path.join('node_modules', entry));
      } catch {
        continue;
      }
      for (const name of scoped) {
        if (name.startsWith('.')) {
          continue;
        }
        addIfShipsSkills(found, `${entry}/${name}`);
      }
      continue;
    }
    if (entry.startsWith('.')) {
      continue;
    }
    addIfShipsSkills(found, entry);
  }
  return [...found].sort();

  function addIfShipsSkills(into, pkg) {
    try {
      if (statSync(path.join('node_modules', pkg, 'skills')).isDirectory()) {
        into.add(pkg);
      }
    } catch {}
  }
}

export function renderAgentsMd(cfg) {
  const skillsDir = cfg.skillsDirs[0];
  const parts = [
    '# AGENTS.md',
    '',
    '## Project skills',
    '',
    projectProse(skillsDir)
  ];
  if (hasSkills(skillsDir)) {
    parts.push('', emitSkillsTable(skillsDir).join('\n'));
  }
  for (const pkg of discoverPackages()) {
    const dir = `node_modules/${pkg}/skills`;
    if (!hasSkills(dir)) {
      continue;
    }
    parts.push(
      '',
      `## Package skills: ${pkg}`,
      '',
      packageProse(pkg, firstSkillName(dir)),
      '',
      emitSkillsTable(dir).join('\n')
    );
  }
  return `${parts.join('\n')}\n`;
}

function projectProse(skillsDir) {
  return (
    'Load any skill below with the `skill` tool by name (e.g., `skill find-skills`), or read its `SKILL.md` directly ' +
    `(e.g., \`read ${skillsDir}/find-skills/SKILL.md\`). If \`${skillsDir}/\` is empty, run \`npx skills-manager install\` ` +
    'to populate it (see [skills-manager docs](https://github.com/netbek/skills-manager)).'
  );
}

function packageProse(pkg, skill) {
  return (
    `The \`${pkg}\` package ships skills under \`node_modules/${pkg}/skills/\`. Use the \`read\` tool to load ` +
    `\`SKILL.md\` files directly (e.g., \`read node_modules/${pkg}/skills/${skill}/SKILL.md\`).`
  );
}
