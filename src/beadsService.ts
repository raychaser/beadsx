import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
