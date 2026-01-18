// Core beads service - shared between VS Code extension and CLI
// No VS Code dependencies - uses injected config and logger

import { execFile } from 'node:child_process';
import { access, constants as fsConstants } from 'node:fs/promises';
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

// Cache the resolved bd path to avoid repeated lookups
let cachedBdPath: string | null = null;

// Pre-compiled regex for exit code extraction (avoids recompilation on each call)
const EXIT_CODE_REGEX = /exit code (\d+)/i;

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
  // Clear bd path cache if commandPath changed
  if (config.commandPath !== newConfig.commandPath) {
    cachedBdPath = null;
  }
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
 * Type for Node.js errors with a code property (ENOENT, EACCES, etc.)
 * beadsx-910: This interface aligns with NodeJS.ErrnoException but is defined
 * locally to avoid @types/node dependency in the core module. If full ErrnoException
 * properties (syscall, errno, path) are needed, import from @types/node instead.
 */
interface NodeJSError extends Error {
  code: string;
  // Optional properties from NodeJS.ErrnoException for future use
  syscall?: string;
  errno?: number;
  path?: string;
}

/**
 * Type guard to check if an error has a specific error code.
 * Works with Node.js errors that have a 'code' property (ENOENT, EACCES, etc.).
 * Returns true as a type guard, allowing TypeScript to narrow the error type.
 */
function hasErrorCode(error: unknown, code: string): error is NodeJSError {
  return error instanceof Error && 'code' in error && (error as NodeJSError).code === code;
}

/**
 * Check if an error indicates "command not found" (ENOENT).
 * Returns true for expected "not found" errors, false for unexpected system errors.
 */
function isNotFoundError(error: unknown): boolean {
  if (hasErrorCode(error, 'ENOENT')) return true;
  if (error instanceof Error && error.message.includes('ENOENT')) return true;
  return false;
}

/**
 * Format bd command errors with user-friendly messages.
 * Handles common error types: maxBuffer exceeded, ENOENT, ETIMEDOUT, EACCES, EPERM, EAGAIN, EMFILE, ENFILE, exit codes.
 */
function formatBdError(error: unknown, maxBufferMsg: string): string {
  if (error instanceof Error) {
    if (error.message.includes('maxBuffer')) {
      return maxBufferMsg;
    }
    if (error.message.includes('ENOENT')) {
      return 'bd command not found. Is it installed and in your PATH?';
    }
    if (error.message.includes('ETIMEDOUT')) {
      return 'bd command timed out. Check if the database is locked or inaccessible.';
    }
    if (hasErrorCode(error, 'EACCES')) {
      return 'Cannot execute bd command: permission denied. Check file permissions.';
    }
    // beadsx-905: Handle additional common error codes
    if (hasErrorCode(error, 'EPERM')) {
      return 'Cannot execute bd command: operation not permitted. Check system permissions.';
    }
    if (hasErrorCode(error, 'EAGAIN')) {
      return 'bd command failed due to resource constraints. Try again in a moment.';
    }
    // beadsx-920: Handle file descriptor limit errors
    if (hasErrorCode(error, 'EMFILE')) {
      return 'Too many open files. Close some applications or increase ulimit.';
    }
    if (hasErrorCode(error, 'ENFILE')) {
      return 'System file table overflow. Close some applications or contact system administrator.';
    }
    // Handle non-zero exit codes with actionable guidance
    const exitCodeMatch = error.message.match(EXIT_CODE_REGEX);
    if (exitCodeMatch) {
      const exitCode = exitCodeMatch[1];
      return `bd command failed (exit code ${exitCode}). Run 'bd <command>' manually to see detailed output.`;
    }
    return `bd command failed: ${error.message}`;
  }
  return `bd command failed: ${String(error)}`;
}

/**
 * Result of checking beads initialization status.
 * Distinguishes between "not initialized" (ENOENT) and "access error" (EACCES, etc.)
 */
export type BeadsInitStatus = 'initialized' | 'not-initialized' | 'access-error';

/**
 * Check if beads is initialized in the given workspace.
 * Returns structured result to distinguish between different failure modes:
 * - 'initialized': .beads directory exists and is accessible
 * - 'not-initialized': .beads directory does not exist (ENOENT)
 * - 'access-error': .beads exists but cannot be accessed (permissions, etc.)
 *
 * Uses async fs access with caching (only caches successful checks and ENOENT).
 */
export async function isBeadsInitialized(workspaceRoot: string): Promise<boolean> {
  const status = await getBeadsInitStatus(workspaceRoot);
  return status === 'initialized';
}

/**
 * Get detailed beads initialization status for the workspace.
 * Use this when you need to distinguish between "not initialized" and "access error".
 */
export async function getBeadsInitStatus(workspaceRoot: string): Promise<BeadsInitStatus> {
  // Return cached result if available (only true/false, not access-error which shouldn't be cached)
  const cached = beadsInitializedCache.get(workspaceRoot);
  if (cached !== undefined) {
    return cached ? 'initialized' : 'not-initialized';
  }

  const beadsDir = path.join(workspaceRoot, '.beads');
  try {
    await access(beadsDir);
    beadsInitializedCache.set(workspaceRoot, true);
    return 'initialized';
  } catch (error: unknown) {
    // ENOENT means directory doesn't exist - expected case, cache the result
    if (hasErrorCode(error, 'ENOENT')) {
      beadsInitializedCache.set(workspaceRoot, false);
      return 'not-initialized';
    }
    // beadsx-902: Other errors (permission denied, etc.) - warn user with actionable guidance
    // Don't cache to allow retry after user fixes the issue
    if (hasErrorCode(error, 'EACCES')) {
      warn(
        `Cannot access .beads directory: permission denied. Check folder permissions for: ${beadsDir}`,
      );
    } else {
      const errorCode =
        error instanceof Error && 'code' in error ? (error as { code: string }).code : 'unknown';
      warn(
        `Cannot access .beads directory (${errorCode}): ${error instanceof Error ? error.message : error}`,
      );
    }
    return 'access-error';
  }
}

/**
 * Clear the beads initialization cache (useful for testing or after workspace changes)
 */
export function clearBeadsInitializedCache(): void {
  beadsInitializedCache.clear();
}

// Common bd installation paths to check if PATH lookup fails
// Note: These are Unix-specific paths. Windows users should configure commandPath explicitly
// or ensure bd is in their PATH. Windows installation typically puts binaries in %LOCALAPPDATA%
// which varies per user and is better handled through explicit configuration.
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

  // If it's already an absolute path, validate it before using
  if (cmd.startsWith('/')) {
    try {
      await access(cmd, fsConstants.X_OK);
      return cmd;
    } catch (error) {
      // beadsx-901: Log validation issues at debug level only.
      // Don't warn here - let execFile provide the detailed error to avoid double-messaging.
      // The error at execution time will be more accurate and include actual failure details.
      if (hasErrorCode(error, 'EACCES')) {
        log(`Configured bd path ${cmd} failed permission check (will try execution anyway)`);
      } else if (isNotFoundError(error)) {
        log(`Configured bd path ${cmd} not found (will try execution anyway)`);
      } else {
        const errMsg = error instanceof Error ? error.message : String(error);
        log(`Configured bd path ${cmd} access check failed: ${errMsg} (will try execution anyway)`);
      }
      // Return the path anyway - will fail with error at execution time
      // This allows the caller to get a more detailed error from execFile
      return cmd;
    }
  }

  // Track if the configured command existed but failed (vs not found)
  let configuredCommandFailed = false;

  // Try the command as-is first (PATH lookup)
  try {
    await execFileAsync(cmd, ['--version'], { timeout: 5000 });
    return cmd; // PATH lookup worked
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    // Distinguish expected errors (command not found) from unexpected system errors
    if (isNotFoundError(error)) {
      log(`bd not found in PATH (${cmd}), checking common installation paths...`);
    } else {
      // beadsx-900: Non-ENOENT errors mean the command exists but is broken.
      // By default, don't silently fall back to a different binary - this could cause
      // confusion if users think they're using their configured bd but are actually
      // using a different installation with different configuration/version.
      configuredCommandFailed = true;
      if (!config.allowFallbackOnFailure) {
        // Throw error instead of falling back - user must explicitly enable fallback
        throw new Error(
          `Configured bd command (${cmd}) failed: ${errMsg}. ` +
            `Fix the binary or set allowFallbackOnFailure: true to use fallback paths.`,
        );
      }
      warn(`bd found but failed to run (${cmd}): ${errMsg}. Trying fallback paths...`);
    }
  }

  // Check fallback paths using fs constants for executable check
  for (const fallbackPath of BD_FALLBACK_PATHS) {
    try {
      await access(fallbackPath, fsConstants.X_OK);
      // If configured command existed but failed, warn that we're using a different binary
      if (configuredCommandFailed) {
        warn(
          `Using fallback bd at ${fallbackPath} instead of configured command (${cmd}). ` +
            `You may be using an unexpected bd installation with different version or configuration.`,
        );
      } else {
        log(`Found bd at fallback path: ${fallbackPath}`);
      }
      return fallbackPath;
    } catch (error) {
      // Distinguish expected errors (file not found) from permission issues
      if (isNotFoundError(error)) {
        log(`Fallback path ${fallbackPath} not found`);
      } else if (hasErrorCode(error, 'EACCES')) {
        // EACCES means the file EXISTS but can't be executed - user might want to fix permissions
        warn(
          `bd found at ${fallbackPath} but cannot execute (permission denied). Check file permissions with: chmod +x ${fallbackPath}`,
        );
      } else {
        // Unexpected errors (ELOOP, EIO, etc.) - warn for visibility
        const errMsg = error instanceof Error ? error.message : String(error);
        warn(`Unexpected error checking ${fallbackPath}: ${errMsg}`);
      }
    }
  }

  // No fallback found, return original (will fail with helpful error)
  log('bd not found in fallback paths, using original command');
  return cmd;
}

/**
 * Clear the cached bd path (useful when config changes or after ENOENT errors)
 */
export function clearBdPathCache(): void {
  cachedBdPath = null;
}

async function getResolvedBdCommand(): Promise<string> {
  if (cachedBdPath === null) {
    cachedBdPath = await findBdExecutable();
  }
  return cachedBdPath;
}

/**
 * Build command arguments for bd, prepending --no-db when useJsonlMode is enabled.
 * This ensures consistent handling of JSONL mode across all bd command invocations.
 *
 * @throws {Error} If args is not an array (indicates programming error in calling code)
 */
export function buildBdArgs(args: string[]): string[] {
  // beadsx-906: Throw for non-array input instead of silently recovering.
  // This is a programming error in calling code and should fail loudly.
  if (!Array.isArray(args)) {
    throw new Error(`buildBdArgs: args must be an array, received ${typeof args}`);
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
    const errorMsg = formatBdError(
      error,
      'Too many ready issues. Please filter or compact old issues.',
    );
    log(`Error: Failed to execute 'bd ready': ${error}`);
    warn(errorMsg);
    // Clear cache on ENOENT so subsequent attempts can find a newly-installed bd
    if (isNotFoundError(error)) {
      clearBdPathCache();
    }
    return { success: false, data: [], error: errorMsg };
  }

  if (stderr) {
    // Surface non-empty stderr to users - may contain important warnings from bd
    const stderrTrimmed = stderr.trim();
    if (stderrTrimmed) {
      warn(`bd ready warning: ${stderrTrimmed}`);
    }
  }

  if (!stdout || !stdout.trim()) {
    log(`bd ready returned empty stdout`);
    return { success: true, data: [] };
  }

  // Parse JSON output - separate error handling for parsing
  try {
    const result = JSON.parse(stdout);

    let issues: BeadsIssue[];
    if (result && Array.isArray(result.issues)) {
      issues = result.issues;
    } else if (Array.isArray(result)) {
      issues = result;
    } else {
      // beadsx-914: Return success:false for unexpected format to surface compatibility issues
      const errorMsg = `bd ready returned unexpected format (${typeof result}). Expected array or {issues: []}.`;
      log(`Warning: ${errorMsg}`);
      warn(errorMsg);
      return { success: false, data: [], error: errorMsg };
    }

    // beadsx-903: Filter tombstones for consistency with exportIssuesWithDeps.
    // While bd ready shouldn't return tombstones, this defensive check ensures
    // soft-deleted issues never appear in any view regardless of bd behavior.
    const activeIssues = issues.filter((issue) => issue.status !== 'tombstone');
    if (activeIssues.length < issues.length) {
      log(
        `Filtered ${issues.length - activeIssues.length} tombstone(s) from ready issues (bd ready returned tombstones unexpectedly)`,
      );
    }

    return { success: true, data: activeIssues };
  } catch (error) {
    // beadsx-907: Include error type/message details for easier debugging
    const errorDetail = error instanceof SyntaxError ? error.message : String(error);
    const truncatedOutput = stdout.length > 200 ? `${stdout.substring(0, 200)}...` : stdout;
    const errorMsg = `Failed to parse ready issues. Output may be corrupted.`;
    log(`Error: Failed to parse 'bd ready' output: ${errorDetail}. Content: "${truncatedOutput}"`);
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
    const errorMsg = formatBdError(
      error,
      'Issue database too large. Please compact old issues with "bd compact".',
    );
    log(`Error: Failed to execute 'bd export': ${error}`);
    warn(errorMsg);
    // Clear cache on ENOENT so subsequent attempts can find a newly-installed bd
    if (isNotFoundError(error)) {
      clearBdPathCache();
    }
    return { success: false, data: [], error: errorMsg };
  }

  if (stderr) {
    // Surface non-empty stderr to users - may contain important warnings from bd
    const stderrTrimmed = stderr.trim();
    if (stderrTrimmed) {
      warn(`bd export warning: ${stderrTrimmed}`);
    }
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
  const failedLines: number[] = []; // beadsx-921: Track failing line numbers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const issue = JSON.parse(line);
      // Compute parentIds from dependencies (parent-child takes precedence, then blocks)
      // Issues can have multiple parents - collect ALL parent-child dependencies
      issue.parentIds = [];
      if (issue.dependencies) {
        for (const dep of issue.dependencies) {
          if (dep.type === 'parent-child') {
            issue.parentIds.push(dep.depends_on_id);
          }
        }
        // Fallback: if no parent-child deps, check for blocks
        if (issue.parentIds.length === 0) {
          const blocksDep = issue.dependencies.find(
            (dep: BeadsDependency) => dep.type === 'blocks',
          );
          if (blocksDep) {
            issue.parentIds.push(blocksDep.depends_on_id);
          }
        }
      }
      issues.push(issue);
    } catch (error) {
      // beadsx-907: Include error type/message details for easier debugging
      const errorDetail = error instanceof SyntaxError ? error.message : String(error);
      const truncatedContent = line.length > 100 ? `${line.substring(0, 100)}...` : line;
      log(`Failed to parse line ${i + 1}: ${errorDetail}. Content: "${truncatedContent}"`);
      failedLines.push(i + 1); // 1-indexed for user display
    }
  }

  // Warn user about parse failures and return partial success as failure
  if (failedLines.length > 0) {
    // beadsx-921: Include first few failing line numbers in user warning
    const lineInfo =
      failedLines.length <= 5
        ? `lines ${failedLines.join(', ')}`
        : `lines ${failedLines.slice(0, 5).join(', ')}... and ${failedLines.length - 5} more`;
    const errorMsg = `${failedLines.length} issue(s) failed to load (${lineInfo}). Enable debug logging for details.`;
    log(`Warning: ${failedLines.length}/${lines.length} lines failed to parse`);
    warn(errorMsg);
    // Return partial data with error - callers can still use data but know it's incomplete
    return { success: false, data: issues, error: errorMsg };
  }

  // Filter out tombstone (soft-deleted) issues - they should never appear in views
  const activeIssues = issues.filter((issue) => issue.status !== 'tombstone');
  log(
    `parsed ${issues.length} issues, ${activeIssues.length} active (filtered ${issues.length - activeIssues.length} tombstones)`,
  );

  return { success: true, data: activeIssues };
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
    // Defensive: explicitly exclude both closed and tombstone statuses
    // Tombstones are filtered earlier in exportIssuesWithDeps, but this guards against regressions
    const openIssues = issues.filter(
      (issue) => issue.status !== 'closed' && issue.status !== 'tombstone',
    );
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
      // Defensive: exclude tombstones even though they're filtered earlier
      if (issue.status === 'tombstone') return false;
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
 * Returns array of issues whose parentIds includes the given issue's id.
 */
export function getChildren(issue: BeadsIssue, allIssues: BeadsIssue[]): BeadsIssue[] {
  return allIssues.filter((i) => i.parentIds.includes(issue.id));
}

/**
 * Get all ancestors of an issue by walking up all parent chains.
 * With multiple parents, this collects ALL unique ancestors from all parent paths.
 * Returns array of ancestors (order not guaranteed with multiple parents).
 * Returns empty array if issue has no parents.
 */
export function getAllAncestors(issue: BeadsIssue, allIssues: BeadsIssue[]): BeadsIssue[] {
  const ancestors: BeadsIssue[] = [];
  const visited = new Set<string>(); // Prevent infinite loops from circular deps
  const issueMap = new Map(allIssues.map((i) => [i.id, i]));
  const missingParents: string[] = [];

  const collectAncestors = (current: BeadsIssue) => {
    for (const parentId of current.parentIds) {
      if (visited.has(parentId)) continue;
      visited.add(parentId);
      const parent = issueMap.get(parentId);
      if (parent) {
        ancestors.push(parent);
        collectAncestors(parent);
      } else {
        // Track missing parent references for debug logging
        missingParents.push(`${current.id} -> ${parentId}`);
      }
    }
  };

  collectAncestors(issue);

  // Debug log missing parent references (may indicate data corruption or tombstones)
  if (missingParents.length > 0) {
    log(`getAllAncestors: missing parent references for ${issue.id}: ${missingParents.join(', ')}`);
  }

  return ancestors;
}

/**
 * Get root issues (issues with no parents OR whose parents are all not in the list)
 */
export function getRootIssues(issues: BeadsIssue[]): BeadsIssue[] {
  const issueIdSet = new Set(issues.map((i) => i.id));
  const orphanedIds: string[] = [];
  const roots = issues.filter((issue) => {
    // No parents means it's a root
    if (issue.parentIds.length === 0) return true;
    // If ALL parents were filtered out (e.g., tombstone), treat this issue as a root
    const allParentsFiltered = issue.parentIds.every((pid) => !issueIdSet.has(pid));
    if (allParentsFiltered) {
      orphanedIds.push(issue.id);
      return true;
    }
    return false;
  });

  // beadsx-904, beadsx-922: Warn when children are promoted to root due to missing parent
  // Users should know why issues suddenly appear at root level (warn is visible, log is debug-only)
  if (orphanedIds.length > 0) {
    warn(
      `${orphanedIds.length} issue(s) promoted to root level (parent not in list, may be tombstone): ${orphanedIds.join(', ')}`,
    );
  }

  return roots;
}
