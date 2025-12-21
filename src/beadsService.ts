import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { DEFAULT_RECENT_WINDOW_MINUTES, validateRecentWindowMinutes } from './utils';

const execFileAsync = promisify(execFile);

/**
 * Check if beads is initialized in the given workspace
 * Returns true if .beads/ directory exists
 */
export function isBeadsInitialized(workspaceRoot: string): boolean {
  const beadsDir = path.join(workspaceRoot, '.beads');
  return fs.existsSync(beadsDir);
}

// Module-level output channel reference for logging
let outputChannel: vscode.OutputChannel | undefined;

export function setOutputChannel(channel: vscode.OutputChannel): void {
  outputChannel = channel;
}

function log(message: string): void {
  if (outputChannel) {
    const timestamp = new Date().toISOString();
    outputChannel.appendLine(`[${timestamp}] beadsService: ${message}`);
  }
}

function getBdCommand(): string {
  const config = vscode.workspace.getConfiguration('beadsx');
  const customPath = config.get<string>('commandPath', '');
  return customPath || 'bd';
}

export interface BeadsDependency {
  issue_id: string;
  depends_on_id: string;
  type: 'blocks' | 'related' | 'parent-child' | 'discovered-from';
  created_at: string;
}

export interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  issue_type: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  assignee: string | null;
  labels: string[];
  dependencies?: BeadsDependency[];
  parentId?: string; // Computed: ID of parent issue (for parent-child dependencies)
}

export async function listReadyIssues(workspaceRoot: string): Promise<BeadsIssue[]> {
  // Skip if beads is not initialized in this workspace
  if (!isBeadsInitialized(workspaceRoot)) {
    log('Beads not initialized in workspace, skipping bd ready');
    return [];
  }

  const bdCmd = getBdCommand();

  // Execute bd command - separate try/catch for accurate error messaging
  let stdout: string;
  let stderr: string;
  try {
    const result = await execFileAsync(bdCmd, ['ready', '--json'], {
      cwd: workspaceRoot,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    log(`Error: Failed to execute 'bd ready': ${error}`);
    vscode.window.showWarningMessage(
      `BeadsX: Failed to execute 'bd' command. Is it installed and in your PATH?`,
    );
    return [];
  }

  if (stderr) {
    log(`Warning: bd ready stderr: ${stderr}`);
  }

  if (!stdout || !stdout.trim()) {
    log(`bd ready returned empty stdout`);
    return [];
  }

  // Parse JSON output - separate error handling for parsing
  try {
    const result = JSON.parse(stdout);

    if (result && Array.isArray(result.issues)) {
      return result.issues;
    }

    if (Array.isArray(result)) {
      return result;
    }

    log(`Warning: bd ready returned unexpected format: ${typeof result}`);
    return [];
  } catch (error) {
    log(`Error: Failed to parse 'bd ready' output: ${error}`);
    vscode.window.showWarningMessage(
      `BeadsX: Failed to parse ready issues. Output may be corrupted.`,
    );
    return [];
  }
}

export type FilterMode = 'all' | 'open' | 'ready' | 'recent';

export async function exportIssuesWithDeps(workspaceRoot: string): Promise<BeadsIssue[]> {
  // Skip if beads is not initialized in this workspace
  if (!isBeadsInitialized(workspaceRoot)) {
    log('Beads not initialized in workspace, skipping bd export');
    return [];
  }

  const bdCmd = getBdCommand();
  log(`exportIssuesWithDeps called with workspaceRoot: ${workspaceRoot}, bdCmd: ${bdCmd}`);

  // Execute bd command - separate try/catch for accurate error messaging
  let stdout: string;
  let stderr: string;
  try {
    const result = await execFileAsync(bdCmd, ['export'], {
      cwd: workspaceRoot,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    log(`Error: Failed to execute 'bd export': ${error}`);
    vscode.window.showWarningMessage(
      `BeadsX: Failed to execute 'bd' command. Is it installed and in your PATH?`,
    );
    return [];
  }

  if (stderr) {
    log(`stderr: ${stderr}`);
  }

  log(`stdout length: ${stdout?.length ?? 0}`);

  if (!stdout || !stdout.trim()) {
    log(`bd export returned empty stdout`);
    return [];
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

  // Warn user if significant parse failures occurred
  if (parseErrors > 0) {
    log(`Warning: ${parseErrors}/${lines.length} lines failed to parse`);
    if (parseErrors > lines.length * 0.1) {
      vscode.window.showWarningMessage(
        `BeadsX: ${parseErrors} issues failed to load. Data may be corrupted.`,
      );
    }
  }

  log(`parsed ${issues.length} issues successfully`);

  return issues;
}

export async function listFilteredIssues(
  workspaceRoot: string,
  filter: FilterMode,
): Promise<BeadsIssue[]> {
  log(`listFilteredIssues called with filter: ${filter}`);

  if (filter === 'ready') {
    const readyIssues = await listReadyIssues(workspaceRoot);
    log(`listFilteredIssues returning ${readyIssues.length} ready issues`);
    return readyIssues;
  }

  // Use export to get dependency info
  const issues = await exportIssuesWithDeps(workspaceRoot);
  log(`listFilteredIssues got ${issues.length} issues from export`);

  if (filter === 'open') {
    const openIssues = issues.filter((issue) => issue.status !== 'closed');
    log(`listFilteredIssues returning ${openIssues.length} open issues`);
    return openIssues;
  }

  if (filter === 'recent') {
    const config = vscode.workspace.getConfiguration('beadsx');
    const configValue = config.get<number>('recentWindowMinutes', DEFAULT_RECENT_WINDOW_MINUTES);
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
    return recentIssues;
  }

  log(`listFilteredIssues returning ${issues.length} issues (all)`);
  return issues;
}
