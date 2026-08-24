import process from 'node:process';

export const STARTER_CONFIG = [
  '# Docs: https://github.com/netbek/skills-sync',
  '',
  '# Agents receiving installs; each name is passed to the skills CLI as an -a flag:',
  'agents:',
  '  - opencode',
  '  - claude-code',
  '',
  '# Directories the CLI fills with skill folders. At least one is required; git-ignored',
  '# entries absent from the list below are pruned:',
  'skills-dirs:',
  '  - .agents/skills',
  '',
  '# Directories of links into the first skills-dirs entry. Dangling or excess',
  '# git-ignored entries are pruned; committed first-party skills get refreshed',
  '# links here:',
  'links-dirs:',
  '  - .claude/skills',
  '',
  '# Third-party skills. Each entry needs a repo, an optional ref, and at least one skill:',
  'repos:',
  '  - repo: vercel-labs/skills',
  '    # ref: v1.2.3',
  '    skills:',
  '      - find-skills'
].join('\n');

export function printStarterConfig() {
  process.stdout.write(`${STARTER_CONFIG}\n`);
}
