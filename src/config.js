import {existsSync, readFileSync, realpathSync} from 'node:fs';
import {parse} from 'yaml';
import {CONFIG_KEYS, DEFAULT_CONFIG_FILE, REPO_KEYS} from './constants.js';
import {CliError} from './errors.js';

export {DEFAULT_CONFIG_FILE};

export function readConfig(file, displayPath = file) {
  if (!existsSync(file)) {
    throw new CliError(`no config at ${displayPath}`);
  }
  const real = realpathSync(file);
  const text = readFileSync(real, 'utf8');
  return parseConfig(text, real);
}

function fail(displayPath, message) {
  throw new CliError(`${displayPath}: ${message}`);
}

export function parseConfig(text, displayPath) {
  let doc;
  try {
    doc = parse(text);
  } catch (e) {
    fail(displayPath, e.message.split('\n')[0]);
  }
  if (doc == null) {
    doc = {};
  }
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    fail(displayPath, 'top level must be a mapping');
  }
  for (const key of Object.keys(doc)) {
    if (!CONFIG_KEYS.includes(key)) {
      fail(displayPath, `unknown key '${key}'`);
    }
  }

  const agents = stringList(doc.agents, displayPath, 'agents');
  const skillsDirs = stringList(doc.skills_dir, displayPath, 'skills_dir');
  if (skillsDirs.length === 0) {
    throw new CliError(`${displayPath} declares no skills_dir`);
  }
  const linksDirs = stringList(doc.links_dir, displayPath, 'links_dir');
  const repos = parseRepos(doc.repos, displayPath);

  return {path: displayPath, agents, skillsDirs, linksDirs, repos};
}

function stringList(value, displayPath, key) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [requireString(value, displayPath, key)];
  }
  return value.map((item, i) =>
    requireString(item, displayPath, `${key}[${i}]`)
  );
}

function requireString(item, displayPath, key) {
  if (typeof item !== 'string' || item.trim() === '') {
    fail(displayPath, `${key} must be a non-empty string`);
  }
  return item;
}

function parseRepos(value, displayPath) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail(displayPath, 'repos must be a list');
  }
  return value.map((item, i) => {
    const at = `repos[${i}]`;
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      fail(displayPath, `${at} must be a mapping`);
    }
    for (const key of Object.keys(item)) {
      if (!REPO_KEYS.includes(key)) {
        fail(displayPath, `${at}: unknown key '${key}'`);
      }
    }
    requireString(item.repo ?? null, displayPath, `${at}.repo`);
    if (
      item.ref != null &&
      (typeof item.ref !== 'string' || item.ref.trim() === '')
    ) {
      fail(displayPath, `${at}.ref must be a non-empty string`);
    }
    const skills = stringList(item.skills ?? null, displayPath, `${at}.skills`);
    if (skills.length === 0) {
      fail(displayPath, `${at}.skills must list at least one skill`);
    }
    return {
      repo: item.repo,
      ...(item.ref != null ? {ref: item.ref} : {}),
      skills
    };
  });
}
