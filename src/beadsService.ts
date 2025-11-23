import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

const execAsync = promisify(exec);

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
  try {
    const { stdout, stderr } = await execAsync('bd ready --json', {
      cwd: workspaceRoot
    });

    if (stderr) {
      console.error('beadsService: stderr:', stderr);
    }

    const result = JSON.parse(stdout);

    if (result && Array.isArray(result.issues)) {
      return result.issues;
    }

    if (Array.isArray(result)) {
      return result;
    }

    return [];
  } catch (error) {
    console.error('beadsService: Failed to list ready issues:', error);
    return [];
  }
}

export type FilterMode = 'all' | 'open' | 'ready';

export async function exportIssuesWithDeps(workspaceRoot: string): Promise<BeadsIssue[]> {
  try {
    // Use full path to bd to avoid PATH issues in VSCode
    log(`exportIssuesWithDeps called with workspaceRoot: ${workspaceRoot}`);
    const { stdout, stderr } = await execAsync('/opt/homebrew/bin/bd export', {
      cwd: workspaceRoot
    });

    if (stderr) {
      log(`stderr: ${stderr}`);
    }

    log(`stdout length: ${stdout?.length ?? 0}`);

    if (!stdout || !stdout.trim()) {
      log(`bd export returned empty stdout`);
      return [];
    }

    // bd export returns JSONL (one JSON object per line)
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    log(`parsing ${lines.length} lines`);

    const issues: BeadsIssue[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      try {
        const issue = JSON.parse(line);
        // Compute parentId from parent-child dependencies
        if (issue.dependencies) {
          const parentDep = issue.dependencies.find(
            (dep: BeadsDependency) => dep.type === 'parent-child'
          );
          if (parentDep) {
            issue.parentId = parentDep.depends_on_id;
          }
        }
        issues.push(issue);
      } catch (error) {
        log(`Failed to parse line ${i}: ${line.substring(0, 100)} - ${error}`);
      }
    }

    log(`parsed ${issues.length} issues successfully`);

    return issues;
  } catch (error) {
    log(`Failed to export issues: ${error}`);
    return [];
  }
}

// Export function to get error info
export async function testBdCommand(workspaceRoot: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync('/opt/homebrew/bin/bd export', {
      cwd: workspaceRoot
    });
    return `stdout length: ${stdout.length}, stderr: ${stderr || 'none'}, lines: ${stdout.trim().split('\n').length}`;
  } catch (error) {
    return `ERROR: ${error}`;
  }
}

export async function listFilteredIssues(workspaceRoot: string, filter: FilterMode): Promise<BeadsIssue[]> {
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
    const openIssues = issues.filter(issue => issue.status !== 'closed');
    log(`listFilteredIssues returning ${openIssues.length} open issues`);
    return openIssues;
  }

  log(`listFilteredIssues returning ${issues.length} issues (all)`);
  return issues;
}
