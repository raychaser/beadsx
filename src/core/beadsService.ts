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
// Default logger writes warnings and errors to console to prevent silent failures
// Debug logs are silent by default until configure() is called with a custom logger
let logger: Logger = {
  log: () => {},
  warn: (msg: string) => console.warn(`[beadsService] ${msg}`),
  error: (msg: string) => console.error(`[beadsService] ${msg}`),
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
    // Other errors (permission denied, etc.) - warn user, don't cache to allow retry
    const errorCode =
      error instanceof Error && 'code' in error ? (error as { code: string }).code : 'unknown';
    warn(
      `Cannot access .beads directory (${errorCode}): ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

/**
 * Clear the beads initialization cache (useful for testing or after workspace changes)
 */
export function clearBeadsInitializedCache(): void {
  beadsInitializedCache.clear();
}

// Common bd installation paths to check if PATH lookup fails
const BD_FALLBACK_PATHS = [
  '/opt/homebrew/bin/bd', // macOS ARM (Apple Silicon)
  '/usr/local/bin/bd', // macOS/Linux
  '/usr/bin/bd', // Linux system install
];

function getBdCommand(): string {
  // Priority: config.commandPath > BD_PATH env var > 'bd' (PATH lookup)
  const customPath = config.commandPath || process.env.BD_PATH;

  if (customPath) {
    // Validate against shell metacharacters and injection vectors
    // Reject: shell operators, command substitution, quotes, newlines, null bytes
    if (/[;&|<>`$"'\\()\n\r\0]/.test(customPath)) {
      warn('Invalid commandPath contains shell metacharacters, using default "bd"');
      return 'bd';
    }
    return customPath;
  }
  return 'bd';
}

/**
 * Try common installation paths if bd is not found in PATH.
 * This helps with compiled binaries that may have restricted PATH.
 */
async function findBdExecutable(): Promise<string> {
  const cmd = getBdCommand();

  // If it's already an absolute path, use it directly
  if (cmd.startsWith('/')) {
    return cmd;
  }

  // Try the command as-is first (PATH lookup)
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    await execFileAsync(cmd, ['--version'], { timeout: 5000 });
    return cmd; // PATH lookup worked
  } catch {
    // PATH lookup failed, try fallback paths
    log('bd not found in PATH, checking common installation paths...');
  }

  // Check fallback paths
  const { access, constants } = await import('node:fs/promises');
  for (const fallbackPath of BD_FALLBACK_PATHS) {
    try {
      await access(fallbackPath, constants.X_OK);
      log(`Found bd at fallback path: ${fallbackPath}`);
      return fallbackPath;
    } catch {
      // Path doesn't exist or isn't executable, try next
    }
  }

  // No fallback found, return original (will fail with helpful error)
  log('bd not found in fallback paths, using original command');
  return cmd;
}

// Cache the resolved bd path to avoid repeated lookups
let cachedBdPath: string | null = null;

async function getResolvedBdCommand(): Promise<string> {
  if (cachedBdPath === null) {
    cachedBdPath = await findBdExecutable();
  }
  return cachedBdPath;
}

/**
 * Build command arguments for bd, prepending --no-db when useJsonlMode is enabled.
 * This ensures consistent handling of JSONL mode across all bd command invocations.
 */
export function buildBdArgs(args: string[]): string[] {
  // Defensive guard: ensure args is an array to prevent runtime errors from spread operator
  if (!Array.isArray(args)) {
    warn('buildBdArgs called with non-array argument, using empty array');
    return config.useJsonlMode ? ['--no-db'] : [];
  }
  if (config.useJsonlMode) {
    return ['--no-db', ...args];
  }
  return args;
}

export async function listReadyIssues(workspaceRoot: string): Promise<BeadsResult<BeadsIssue[]>> {
  // Skip if beads is not initialized in this workspace
  if (!(await isBeadsInitialized(workspaceRoot))) {
    log('Beads not initialized in workspace, skipping bd ready');
    return { success: true, data: [] };
  }

  const bdCmd = await getResolvedBdCommand();

  // Execute bd command - separate try/catch for accurate error messaging
  let stdout: string;
  let stderr: string;
  try {
    const cmdArgs = buildBdArgs(['ready', '--json']);
    const result = await execFileAsync(bdCmd, cmdArgs, {
      cwd: workspaceRoot,
      timeout: 30000, // 30 second timeout to prevent hanging
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large ready lists
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    // Provide more specific error messages based on error type
    let errorMsg: string;
    if (error instanceof Error && error.message.includes('maxBuffer')) {
      errorMsg = 'Too many ready issues. Please filter or compact old issues.';
    } else if (error instanceof Error && error.message.includes('ENOENT')) {
      errorMsg = `Failed to execute 'bd' command. Is it installed and in your PATH?`;
    } else {
      errorMsg = `Failed to execute 'bd' command. Is it installed and in your PATH?`;
    }
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

  const bdCmd = await getResolvedBdCommand();
  log(`exportIssuesWithDeps called with workspaceRoot: ${workspaceRoot}, bdCmd: ${bdCmd}`);

  // Execute bd command - separate try/catch for accurate error messaging
  let stdout: string;
  let stderr: string;
  try {
    const cmdArgs = buildBdArgs(['export']);
    const result = await execFileAsync(bdCmd, cmdArgs, {
      cwd: workspaceRoot,
      timeout: 30000, // 30 second timeout to prevent hanging
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large issue databases
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    // Provide more specific error messages based on error type
    let errorMsg: string;
    if (error instanceof Error && error.message.includes('maxBuffer')) {
      errorMsg = 'Issue database too large. Please compact old issues with "bd compact".';
    } else if (error instanceof Error && error.message.includes('ENOENT')) {
      errorMsg = `Failed to execute 'bd' command. Is it installed and in your PATH?`;
    } else {
      errorMsg = `Failed to execute 'bd' command. Is it installed and in your PATH?`;
    }
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

  // Warn user about parse failures and return partial success as failure
  if (parseErrors > 0) {
    const errorMsg = `${parseErrors} issue(s) failed to load due to parsing errors.`;
    log(`Warning: ${parseErrors}/${lines.length} lines failed to parse`);
    warn(errorMsg);
    // Return partial data with error - callers can still use data but know it's incomplete
    return { success: false, data: issues, error: errorMsg };
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
