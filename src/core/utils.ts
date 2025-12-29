// Utility functions extracted for testability
// Shared between VS Code extension and CLI

import type { BeadsIssue, SortableIssue } from './types';

/**
 * Compute depth of each issue in a hierarchy.
 * Handles circular references by breaking cycles when detected during traversal.
 * When a cycle is detected, the cyclic node returns depth 0, so the node that
 * triggered the detection gets depth 1 (e.g., self-reference A->A gets depth 1).
 * Returns a Map from issue ID to depth.
 */
export function computeIssueDepths(issues: BeadsIssue[]): Map<string, number> {
  const depthMap = new Map<string, number>();
  const issueMap = new Map(issues.map((i) => [i.id, i]));

  const computeDepth = (issue: BeadsIssue, visiting: Set<string>): number => {
    // Return cached result if already computed
    if (depthMap.has(issue.id)) return depthMap.get(issue.id)!;

    // No parent means root level
    if (!issue.parentId) {
      depthMap.set(issue.id, 0);
      return 0;
    }

    // Detect circular reference - treat as root if cycle found
    if (visiting.has(issue.id)) {
      depthMap.set(issue.id, 0);
      return 0;
    }

    // Parent not in issue list - treat as root
    const parent = issueMap.get(issue.parentId);
    if (!parent) {
      depthMap.set(issue.id, 0);
      return 0;
    }

    // Recurse to parent with cycle detection
    visiting.add(issue.id);
    const depth = computeDepth(parent, visiting) + 1;
    visiting.delete(issue.id);
    depthMap.set(issue.id, depth);
    return depth;
  };

  // Compute depth for all issues
  for (const issue of issues) {
    computeDepth(issue, new Set());
  }

  return depthMap;
}

/**
 * Format a date string as relative time (e.g., "5s ago", "5m ago", "2h ago", "yesterday")
 * Returns empty string for invalid dates or future dates
 */
export function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (Number.isNaN(diffMs) || diffMs < 0) return '';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

/**
 * Sort issues: open first (by priority), then closed sorted by most recently closed
 * Returns a new array (does not mutate input)
 */
export function sortIssues<T extends SortableIssue>(issues: T[]): T[] {
  return [...issues].sort((a, b) => {
    // Open issues come before closed
    if (a.status !== 'closed' && b.status === 'closed') return -1;
    if (a.status === 'closed' && b.status !== 'closed') return 1;

    // Both closed: sort by closed_at (most recent first)
    if (a.status === 'closed' && b.status === 'closed') {
      const aTime = a.closed_at ? new Date(a.closed_at).getTime() : 0;
      const bTime = b.closed_at ? new Date(b.closed_at).getTime() : 0;
      // Treat NaN as 0 (oldest) - validation/logging happens in beadsService
      const safeATime = Number.isNaN(aTime) ? 0 : aTime;
      const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
      return safeBTime - safeATime; // Descending (most recent first)
    }

    // Both open: sort by priority (0 first, then 1, 2, etc.)
    return a.priority - b.priority;
  });
}

// Configuration limits for recentWindowMinutes
export const MIN_RECENT_WINDOW_MINUTES = 1; // 1 minute minimum
export const MAX_RECENT_WINDOW_MINUTES = 10080; // 1 week maximum (7 * 24 * 60)
export const DEFAULT_RECENT_WINDOW_MINUTES = 60; // 1 hour default

/**
 * Validate and clamp recentWindowMinutes config value
 * Returns the validated value and whether it was modified
 */
export function validateRecentWindowMinutes(value: unknown): {
  value: number;
  warning: string | null;
} {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return {
      value: DEFAULT_RECENT_WINDOW_MINUTES,
      warning: `Invalid recentWindowMinutes config, using default ${DEFAULT_RECENT_WINDOW_MINUTES} minutes`,
    };
  }
  if (value < MIN_RECENT_WINDOW_MINUTES) {
    return {
      value: MIN_RECENT_WINDOW_MINUTES,
      warning: `recentWindowMinutes (${value}) below minimum, clamping to ${MIN_RECENT_WINDOW_MINUTES}`,
    };
  }
  if (value > MAX_RECENT_WINDOW_MINUTES) {
    return {
      value: MAX_RECENT_WINDOW_MINUTES,
      warning: `recentWindowMinutes (${value}) above maximum, clamping to ${MAX_RECENT_WINDOW_MINUTES}`,
    };
  }
  return { value, warning: null };
}
