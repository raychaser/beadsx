// Core types shared between VS Code extension and CLI

export interface BeadsDependency {
  issue_id: string;
  depends_on_id: string;
  type: 'blocks' | 'related' | 'parent-child' | 'discovered-from';
  created_at: string;
}

// Issue status values (tombstone = soft-deleted, should be filtered out of views)
export type IssueStatus = 'open' | 'in_progress' | 'blocked' | 'closed' | 'tombstone';

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
  parentIds: string[]; // Computed: IDs of parent issues (for parent-child dependencies). Empty = root issue.
}

export type FilterMode = 'all' | 'open' | 'ready' | 'recent';

export interface BeadsConfig {
  commandPath?: string;
  shortIds?: boolean;
  autoExpandOpen?: boolean;
  recentWindowMinutes?: number;
  useJsonlMode?: boolean; // When true, adds --no-db to all bd commands
  /**
   * When true, allows fallback to common installation paths if the configured
   * bd command fails (not just "not found" but also crashes/errors).
   * Default: false - configured command failures will error instead of using fallback.
   * Set to true if you want automatic fallback even when your configured bd is broken.
   */
  allowFallbackOnFailure?: boolean;
}

export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Sort mode for issue lists.
 * - 'default': Open issues first (sorted by priority, lower = higher), then closed issues by recency
 * - 'recent': All issues sorted by updated_at timestamp (most recently updated first)
 */
export type SortMode = 'default' | 'recent';

/**
 * Minimum interface for sortable issues.
 * Any type with these fields can be sorted using sortIssues().
 *
 * @remarks
 * - `status` uses strict `IssueStatus` type (beadsx-911: removed `| string` widening)
 * - `priority` uses lower-is-higher ordering (0 = critical, 4 = backlog)
 * - `closed_at` should be set when `status === 'closed'`
 * - `updated_at` and `closed_at` should be ISO 8601 date strings; invalid dates are treated as oldest
 *
 * For unvalidated external data, parse and validate status before creating SortableIssue.
 */
export interface SortableIssue {
  status: IssueStatus;
  priority: number;
  closed_at: string | null;
  updated_at: string;
}

// Result type for operations that can fail - discriminated union prevents illegal states
export type BeadsResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; data: T; error: string };
