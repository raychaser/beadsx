// Core beads service - shared between VS Code extension and CLI
// No VS Code dependencies - uses injected config and logger

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type {
  BeadsConfig,
  BeadsDependency,
  BeadsIssue,
  BeadsResult,
  FilterMode,
  Logger,
} from './types';
import { DEFAULT_RECENT_WINDOW_MINUTES, validateRecentWindowMinutes } from './utils';

const execFileAsync = promisify(execFile);

// Cache for beads initialization status to avoid repeated fs checks
const beadsInitializedCache = new Map<string, boolean>();

// Module-level configuration and logger
let config: BeadsConfig = {};
let logger: Logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

// Optional user notification callback (for VS Code warnings, CLI messages, etc.)
let notifyUser: ((message: string, type: 'info' | 'warn' | 'error') => void) | undefined;

/**
 * Configure the beads service with custom settings and logger
 */
export function configure(
  newConfig: BeadsConfig,
  newLogger?: Logger,
  notify?: (message: string, type: 'info' | 'warn' | 'error') => void,
): void {
  config = newConfig;
  if (newLogger) {
    logger = newLogger;
  }
  notifyUser = notify;
}

/**
 * Get current configuration (for consumers that need to read settings)
 */
export function getConfig(): BeadsConfig {
  return config;
}

function log(message: string): void {
  logger.log(`beadsService: ${message}`);
}

function warn(message: string): void {
  logger.warn(`beadsService: ${message}`);
  notifyUser?.(message, 'warn');
}

/**
 * Check if beads is initialized in the given workspace
 * Returns true if .beads/ directory exists
 * Uses async fs access with caching to avoid blocking the UI thread
 */
export async function isBeadsInitialized(workspaceRoot: string): Promise<boolean> {
  // Return cached result if available
  const cached = beadsInitializedCache.get(workspaceRoot);
  if (cached !== undefined) {
    return cached;
  }

  const beadsDir = path.join(workspaceRoot, '.beads');
  try {
    await access(beadsDir);
    beadsInitializedCache.set(workspaceRoot, true);
    return true;
  } catch (error: unknown) {
    // ENOENT means directory doesn't exist - expected case, cache the result
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      beadsInitializedCache.set(workspaceRoot, false);
      return false;
    }
    // Other errors (permission denied, etc.) - log warning, don't cache to allow retry
    log(`Warning: Could not check beads initialization: ${error}`);
    return false;
  }
}

/**
 * Clear the beads initialization cache (useful for testing or after workspace changes)
 */
export function clearBeadsInitializedCache(): void {
  beadsInitializedCache.clear();
}

function getBdCommand(): string {
  const customPath = config.commandPath;

  if (customPath) {
    // Validate against shell metacharacters and injection vectors
    // Reject: shell operators, command substitution, quotes, newlines, null bytes
    if (/[;&|<>`$"'\\()\n\r\0]/.test(customPath)) {
      log('Warning: Invalid commandPath contains shell metacharacters, using default');
      return 'bd';
    }
    return customPath;
  }
  return 'bd';
}

export async function listReadyIssues(workspaceRoot: string): Promise<BeadsResult<BeadsIssue[]>> {
  // Skip if beads is not initialized in this workspace
  if (!(await isBeadsInitialized(workspaceRoot))) {
    log('Beads not initialized in workspace, skipping bd ready');
    return { success: true, data: [] };
  }

  const bdCmd = getBdCommand();

  // Execute bd command - separate try/catch for accurate error messaging
  let stdout: string;
  let stderr: string;
  try {
    const result = await execFileAsync(bdCmd, ['ready', '--json'], {
      cwd: workspaceRoot,
      timeout: 30000, // 30 second timeout to prevent hanging
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const errorMsg = `Failed to execute 'bd' command. Is it installed and in your PATH?`;
    log(`Error: Failed to execute 'bd ready': ${error}`);
    warn(errorMsg);
    return { success: false, data: [], error: errorMsg };
  }

  if (stderr) {
    log(`Warning: bd ready stderr: ${stderr}`);
  }

  if (!stdout || !stdout.trim()) {
    log(`bd ready returned empty stdout`);
    return { success: true, data: [] };
  }

  // Parse JSON output - separate error handling for parsing
  try {
    const result = JSON.parse(stdout);

    if (result && Array.isArray(result.issues)) {
      return { success: true, data: result.issues };
    }

    if (Array.isArray(result)) {
      return { success: true, data: result };
    }

    log(`Warning: bd ready returned unexpected format: ${typeof result}`);
    return { success: true, data: [] };
  } catch (error) {
    const errorMsg = `Failed to parse ready issues. Output may be corrupted.`;
    log(`Error: Failed to parse 'bd ready' output: ${error}`);
    warn(errorMsg);
    return { success: false, data: [], error: errorMsg };
  }
}

export async function exportIssuesWithDeps(
  workspaceRoot: string,
): Promise<BeadsResult<BeadsIssue[]>> {
  // Skip if beads is not initialized in this workspace
  if (!(await isBeadsInitialized(workspaceRoot))) {
    log('Beads not initialized in workspace, skipping bd export');
    return { success: true, data: [] };
  }

  const bdCmd = getBdCommand();
  log(`exportIssuesWithDeps called with workspaceRoot: ${workspaceRoot}, bdCmd: ${bdCmd}`);

  // Execute bd command - separate try/catch for accurate error messaging
  let stdout: string;
  let stderr: string;
  try {
    const result = await execFileAsync(bdCmd, ['export'], {
      cwd: workspaceRoot,
      timeout: 30000, // 30 second timeout to prevent hanging
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const errorMsg = `Failed to execute 'bd' command. Is it installed and in your PATH?`;
    log(`Error: Failed to execute 'bd export': ${error}`);
    warn(errorMsg);
    return { success: false, data: [], error: errorMsg };
  }

  if (stderr) {
    log(`stderr: ${stderr}`);
  }

  log(`stdout length: ${stdout?.length ?? 0}`);

  if (!stdout || !stdout.trim()) {
    log(`bd export returned empty stdout`);
    return { success: true, data: [] };
  }

  // Parse JSONL output - separate error handling for parsing
  const lines = stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim());
  log(`parsing ${lines.length} lines`);

  const issues: BeadsIssue[] = [];
  let parseErrors = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const issue = JSON.parse(line);
      // Compute parentId from dependencies (parent-child takes precedence, then blocks)
      if (issue.dependencies) {
        const parentDep =
          issue.dependencies.find((dep: BeadsDependency) => dep.type === 'parent-child') ||
          issue.dependencies.find((dep: BeadsDependency) => dep.type === 'blocks');
        if (parentDep) {
          issue.parentId = parentDep.depends_on_id;
        }
      }
      issues.push(issue);
    } catch (error) {
      log(`Failed to parse line ${i}: ${error}`);
      parseErrors++;
    }
  }

  // Always warn user about parse failures (not just >10%)
  if (parseErrors > 0) {
    const errorMsg = `${parseErrors} issue(s) failed to load due to parsing errors.`;
    log(`Warning: ${parseErrors}/${lines.length} lines failed to parse`);
    warn(errorMsg);
  }

  log(`parsed ${issues.length} issues successfully`);

  return { success: true, data: issues };
}

export async function listFilteredIssues(
  workspaceRoot: string,
  filter: FilterMode,
): Promise<BeadsResult<BeadsIssue[]>> {
  log(`listFilteredIssues called with filter: ${filter}`);

  if (filter === 'ready') {
    const result = await listReadyIssues(workspaceRoot);
    log(`listFilteredIssues returning ${result.data.length} ready issues`);
    return result;
  }

  // Use export to get dependency info
  const result = await exportIssuesWithDeps(workspaceRoot);
  if (!result.success) {
    return result;
  }
  const issues = result.data;
  log(`listFilteredIssues got ${issues.length} issues from export`);

  if (filter === 'open') {
    const openIssues = issues.filter((issue) => issue.status !== 'closed');
    log(`listFilteredIssues returning ${openIssues.length} open issues`);
    return { success: true, data: openIssues };
  }

  if (filter === 'recent') {
    const configValue = config.recentWindowMinutes ?? DEFAULT_RECENT_WINDOW_MINUTES;
    const { value: recentWindowMinutes, warning } = validateRecentWindowMinutes(configValue);
    if (warning) {
      log(`Warning: ${warning}`);
    }

    const cutoffTime = Date.now() - recentWindowMinutes * 60 * 1000;

    const recentIssues = issues.filter((issue) => {
      if (issue.status !== 'closed') return true;
      if (!issue.closed_at) {
        log(`Warning: Closed issue ${issue.id} has no closed_at timestamp`);
        return false;
      }
      const closedTime = new Date(issue.closed_at).getTime();
      if (Number.isNaN(closedTime)) {
        log(`Warning: Issue ${issue.id} has invalid closed_at: "${issue.closed_at}"`);
        return false;
      }
      return closedTime >= cutoffTime;
    });

    log(
      `listFilteredIssues returning ${recentIssues.length} recent issues (window: ${recentWindowMinutes}m)`,
    );
    return { success: true, data: recentIssues };
  }

  log(`listFilteredIssues returning ${issues.length} issues (all)`);
  return { success: true, data: issues };
}

/**
 * Get immediate children of an issue.
 * Returns array of issues whose parentId matches the given issue's id.
 */
export function getChildren(issue: BeadsIssue, allIssues: BeadsIssue[]): BeadsIssue[] {
  return allIssues.filter((i) => i.parentId === issue.id);
}

/**
 * Get all ancestors of an issue by walking up the parentId chain.
 * Returns array from root ancestor to immediate parent (excludes the issue itself).
 * Returns empty array if issue has no parent.
 */
export function getAllAncestors(issue: BeadsIssue, allIssues: BeadsIssue[]): BeadsIssue[] {
  const ancestors: BeadsIssue[] = [];
  const visited = new Set<string>(); // Prevent infinite loops from circular deps

  let current = issue;
  while (current.parentId && !visited.has(current.parentId)) {
    visited.add(current.parentId);
    const parent = allIssues.find((i) => i.id === current.parentId);
    if (!parent) break;
    ancestors.unshift(parent); // Add to front to get root-first order
    current = parent;
  }

  return ancestors;
}

/**
 * Get root issues (issues with no parent OR whose parent is not in the list)
 */
export function getRootIssues(issues: BeadsIssue[]): BeadsIssue[] {
  return issues.filter((issue) => {
    if (!issue.parentId) return true;
    // If parent was filtered out, treat this issue as a root
    const parentInList = issues.some((i) => i.id === issue.parentId);
    return !parentInList;
  });
}
