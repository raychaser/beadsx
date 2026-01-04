#!/usr/bin/env node
// bdx - Terminal UI for beads issue tracking

import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { Command } from 'commander';
import * as path from 'node:path';
import { configure, type Logger } from '../core';
import { App } from './App';
import { validateBeadsInitialized, validateWorkspace } from './validation';
import pkg from '../../package.json';

// Build clean argv for Commander
// Bun compiled binaries have quirky argv - need [node, script, ...args] format
const realBinaryPath = path.resolve(process.execPath);
const userArgs = process.argv.slice(2).filter((arg) => {
  if (arg.includes('/$bunfs/')) return false;
  if (path.resolve(arg) === realBinaryPath) return false;
  return true;
});
// Commander expects [execPath, scriptPath, ...userArgs]
const commanderArgv = [process.execPath, 'bdx', ...userArgs];

const program = new Command();

program
  .name('bdx')
  .description('Interactive TUI for beads issue tracking')
  .version(pkg.version)
  .argument('[workspace-path]', 'Path to workspace directory (default: current directory)')
  .option('-v, --verbose', 'Enable verbose logging')
  // Commander.js: defining only --no-db makes opts.db default to true
  // When user passes --no-db, opts.db becomes false
  .option('--no-db', 'Use JSONL mode (prevents auto-discovery of parent databases)')
  .addHelpText(
    'after',
    `
Keyboard shortcuts:
  j/k or arrows  Navigate up/down
  h/l or arrows  Collapse/expand
  1-4            Switch filter (All/Open/Ready/Recent)
  r              Refresh
  q              Quit`
  )
  .parse(commanderArgv);

const opts = program.opts<{ verbose?: boolean; db: boolean }>();
const verbose = opts.verbose ?? false;
const noDb = !opts.db;
const workspaceRoot = path.resolve(program.args[0] ?? process.cwd());

// Configure the core service with logger
const logger: Logger = {
  log: (msg) => {
    if (verbose) {
      console.error(`[debug] ${msg}`);
    }
  },
  warn: (msg) => console.error(`[warn] ${msg}`),
  error: (msg) => console.error(`[error] ${msg}`),
};

configure({ useJsonlMode: noDb }, logger, (message, type) => {
  if (type === 'error') {
    console.error(`Error: ${message}`);
  } else if (type === 'warn') {
    console.error(`Warning: ${message}`);
  } else if (type === 'info' && verbose) {
    console.error(`Info: ${message}`);
  }
});

async function main() {
  // Validate workspace path exists and is a directory
  const workspaceResult = await validateWorkspace(workspaceRoot);
  if (!workspaceResult.valid) {
    console.error(`Error: ${workspaceResult.error}`);
    process.exit(workspaceResult.exitCode);
  }

  // Check if beads is initialized
  const beadsResult = await validateBeadsInitialized(workspaceRoot);
  if (!beadsResult.valid) {
    console.error(`Error: ${beadsResult.error}`);
    process.exit(beadsResult.exitCode);
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    onDestroy: () => process.exit(0),
  });

  const handleQuit = () => {
    renderer.destroy();
    // process.exit(0) will be called by onDestroy callback
  };

  createRoot(renderer).render(<App workspaceRoot={workspaceRoot} onQuit={handleQuit} />);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
