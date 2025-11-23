import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

export async function listIssues(workspaceRoot: string): Promise<BeadsIssue[]> {
  try {
    console.log('beadsService: listIssues called with workspaceRoot:', workspaceRoot);

    const { stdout, stderr } = await execAsync('bd list --json', {
      cwd: workspaceRoot
    });

    if (stderr) {
      console.error('beadsService: stderr:', stderr);
    }

    console.log('beadsService: stdout:', stdout);

    const result = JSON.parse(stdout);

    // bd list --json returns an object with an "issues" array
    if (result && Array.isArray(result.issues)) {
      return result.issues;
    }

    // Fallback if it's already an array
    if (Array.isArray(result)) {
      return result;
    }

    return [];
  } catch (error) {
    console.error('beadsService: Failed to list beads issues:', error);
    return [];
  }
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
    const { stdout, stderr } = await execAsync('bd export', {
      cwd: workspaceRoot
    });

    if (stderr) {
      console.error('beadsService: stderr:', stderr);
    }

    // bd export returns JSONL (one JSON object per line)
    const lines = stdout.trim().split('\n').filter(line => line.trim());
    const issues: BeadsIssue[] = lines.map(line => {
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
      return issue;
    });

    return issues;
  } catch (error) {
    console.error('beadsService: Failed to export issues:', error);
    return [];
  }
}

export async function listFilteredIssues(workspaceRoot: string, filter: FilterMode): Promise<BeadsIssue[]> {
  if (filter === 'ready') {
    return listReadyIssues(workspaceRoot);
  }

  // Use export to get dependency info
  const issues = await exportIssuesWithDeps(workspaceRoot);

  if (filter === 'open') {
    return issues.filter(issue => issue.status !== 'closed');
  }

  return issues;
}
