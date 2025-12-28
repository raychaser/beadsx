// Core types shared between VS Code extension and CLI

export interface BeadsDependency {
  issue_id: string;
  depends_on_id: string;
  type: 'blocks' | 'related' | 'parent-child' | 'discovered-from';
  created_at: string;
}

// Issue status values
export type IssueStatus = 'open' | 'in_progress' | 'blocked' | 'closed';

// Issue type values
export type IssueType = 'bug' | 'feature' | 'epic' | 'chore' | 'task';

export interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: number;
  issue_type: IssueType;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  assignee: string | null;
  labels: string[];
  dependencies?: BeadsDependency[];
  parentId?: string; // Computed: ID of parent issue (for parent-child dependencies)
}

export type FilterMode = 'all' | 'open' | 'ready' | 'recent';

export interface BeadsConfig {
  commandPath?: string;
  shortIds?: boolean;
  autoExpandOpen?: boolean;
  recentWindowMinutes?: number;
}

export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Reusable interface for sortable issues
export interface SortableIssue {
  status: string;
  priority: number;
  closed_at: string | null;
}

// Result type for operations that can fail
export interface BeadsResult<T> {
  success: boolean;
  data: T;
  error?: string;
}
