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
  useJsonlMode?: boolean; // When true, adds --no-db to all bd commands
}

export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Sort mode for sortIssues function
export type SortMode = 'default' | 'recent';

// Reusable interface for sortable issues
// Uses IssueStatus | string for compatibility with external data that may have unknown statuses
export interface SortableIssue {
  status: IssueStatus | string;
  priority: number;
  closed_at: string | null;
  updated_at: string;
}

// Result type for operations that can fail - discriminated union prevents illegal states
export type BeadsResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; data: T; error: string };
