// Core types shared between VS Code extension and CLI

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
