#!/usr/bin/env node
// bdx - Terminal UI for beads issue tracking

import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import * as path from 'node:path';
import { stat } from 'node:fs/promises';
import { configure, isBeadsInitialized, type Logger } from '../core';
import { App } from './App';

// Parse command line arguments
// Note: Bun compiled binaries include internal paths in argv, so we filter them out
// We check for Bun's internal bunfs path and the exact binary path to avoid filtering legitimate args
const binaryPath = process.argv[1];
const args = process.argv.slice(2).filter((arg) => {
  // Filter Bun's internal filesystem paths
  if (arg.includes('/$bunfs/')) return false;
  // Filter the exact binary path (Bun includes it in argv[2] when compiled)
  if (binaryPath && arg === binaryPath.replace('/$bunfs/root/', '/')) return false;
  return true;
});
const verbose = args.includes('--verbose') || args.includes('-v');
const showHelp = args.includes('--help') || args.includes('-h');

// Filter out flags to get workspace path
const nonFlagArgs = args.filter((arg) => !arg.startsWith('-'));
const rawWorkspaceRoot = nonFlagArgs[0] || process.cwd();
const workspaceRoot = path.resolve(rawWorkspaceRoot);

// Show help and exit
if (showHelp) {
  console.log('Usage: bdx [options] [workspace-path]');
  console.log('');
  console.log('Interactive TUI for beads issue tracking');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help     Show this help message');
  console.log('  -v, --verbose  Enable verbose logging');
  console.log('');
  console.log('Keyboard shortcuts:');
  console.log('  j/k or arrows  Navigate up/down');
  console.log('  h/l or arrows  Collapse/expand');
  console.log('  1-4            Switch filter (All/Open/Ready/Recent)');
  console.log('  r              Refresh');
  console.log('  q              Quit');
  process.exit(0);
}

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

configure({}, logger, (message, type) => {
  if (type === 'error') {
    console.error(`Error: ${message}`);
  } else if (type === 'warn') {
    console.error(`Warning: ${message}`);
  }
});

async function main() {
  // Validate workspace path exists and is a directory
  try {
    const stats = await stat(workspaceRoot);
    if (!stats.isDirectory()) {
      console.error(`Error: ${workspaceRoot} is not a directory`);
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      console.error(`Error: Directory not found: ${workspaceRoot}`);
    } else if (err instanceof Error && 'code' in err && err.code === 'EACCES') {
      console.error(`Error: Permission denied accessing ${workspaceRoot}`);
    } else {
      console.error(`Error: Cannot access ${workspaceRoot}: ${err}`);
    }
    process.exit(1);
  }

  // Check if beads is initialized using core function
  if (!(await isBeadsInitialized(workspaceRoot))) {
    console.error(`Error: No .beads directory found in ${workspaceRoot}`);
    console.error('Run "bd init" to initialize beads in this directory.');
    process.exit(1);
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
