#!/usr/bin/env node
// bdx - Terminal UI for beads issue tracking

import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import * as path from 'node:path';
import { configure, type Logger } from '../core';
import { App } from './App';

// Get workspace root from args or current directory
const workspaceRoot = process.argv[2] || process.cwd();

// Configure the core service with console logger
const logger: Logger = {
  log: (msg) => {
    // Silent in normal operation, could add --verbose flag
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
  // Check if beads is initialized
  const beadsDir = path.join(workspaceRoot, '.beads');
  try {
    await import('node:fs/promises').then((fs) => fs.access(beadsDir));
  } catch {
    console.error(`Error: No .beads directory found in ${workspaceRoot}`);
    console.error('Run "bd init" to initialize beads in this directory.');
    process.exit(1);
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  createRoot(renderer).render(<App workspaceRoot={workspaceRoot} />);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
