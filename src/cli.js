import path from 'node:path';
import process from 'node:process';
import {realpathSync} from 'node:fs';
import {renderAgentsMd} from './agents-md.js';
import {DEFAULT_CHECKSUM_FILE, DEFAULT_CONFIG_FILE} from './constants.js';
import {readConfig} from './config.js';
import {CliError, UsageError} from './errors.js';
import {install} from './install.js';
import {findRoot} from './paths.js';
import {printStarterConfig} from './starter-config.js';
import {uninstall} from './uninstall.js';
import {USAGE} from './usage.js';

const COMMANDS = new Set(['config', 'install', 'uninstall', 'agents-md']);
const VALUE_FLAGS = new Set(['--config', '--root', '--checksum']);

function parseArgs(argv) {
  let action;
  let force = false;
  let config;
  let root;
  let checksum;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (COMMANDS.has(arg)) {
      if (action) {
        throw new UsageError();
      }
      action = arg;
    } else if (arg === '--force') {
      force = true;
    } else if (VALUE_FLAGS.has(arg)) {
      if (i + 1 >= argv.length) {
        throw new UsageError();
      }
      const value = argv[++i];
      if (arg === '--config') {
        config = value;
      } else if (arg === '--root') {
        root = value;
      } else {
        checksum = value;
      }
    } else {
      throw new UsageError();
    }
  }
  if (!action) {
    throw new UsageError();
  }
  return {action, force, config, root, checksum};
}

export function main(argv) {
  try {
    const opts = parseArgs(argv);
    const rootDir = realpathSync(opts.root ?? findRoot());
    process.chdir(rootDir);

    if (opts.action === 'config') {
      printStarterConfig();
      return 0;
    }

    const configFile = opts.config ?? DEFAULT_CONFIG_FILE;
    const cfg = readConfig(configFile, path.join(rootDir, configFile));
    const checksumFile = opts.checksum ?? DEFAULT_CHECKSUM_FILE;

    switch (opts.action) {
      case 'install':
        return install({force: opts.force, cfg, checksumFile});
      case 'uninstall':
        return uninstall({cfg, checksumFile});
      case 'agents-md':
        process.stdout.write(renderAgentsMd(cfg));
        return 0;
      default:
        throw new CliError(`unknown action: ${opts.action}`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`${USAGE}\n`);
      return 1;
    }
    process.stderr.write(`error: ${e.message}\n`);
    return 1;
  }
}
