// Utility functions extracted for testability
// Shared between VS Code extension and CLI

import type { BeadsIssue, SortableIssue, SortMode } from './types';

/**
 * Compute depth of each issue in a hierarchy.
 * With multiple parents, uses minimum depth (closest path to root).
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

    // No parents means root level
    if (issue.parentIds.length === 0) {
      depthMap.set(issue.id, 0);
      return 0;
    }

    // Detect circular reference - treat as root if cycle found
    if (visiting.has(issue.id)) {
      depthMap.set(issue.id, 0);
      return 0;
    }

    visiting.add(issue.id);

    // Find minimum depth among all parents
    let minDepth = Infinity;
    for (const parentId of issue.parentIds) {
      const parent = issueMap.get(parentId);
      if (parent) {
        const parentDepth = computeDepth(parent, visiting);
        minDepth = Math.min(minDepth, parentDepth + 1);
      }
    }

    visiting.delete(issue.id);

    // If no valid parent found, treat as root
    const depth = minDepth === Infinity ? 0 : minDepth;
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
 * Sort issues based on the specified mode.
 * - 'default': Open first (by priority), then closed by most recently closed
 * - 'recent': All issues sorted by updated_at (most recently updated first)
 * Returns a new array (does not mutate input)
 */
export function sortIssues<T extends SortableIssue>(issues: T[], mode: SortMode = 'default'): T[] {
  if (mode === 'recent') {
    // Sort all issues by updated_at (most recently updated first)
    return [...issues].sort((a, b) => {
      const aTime = new Date(a.updated_at).getTime();
      const bTime = new Date(b.updated_at).getTime();
      // Treat NaN as 0 (oldest)
      const safeATime = Number.isNaN(aTime) ? 0 : aTime;
      const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
      return safeBTime - safeATime; // Descending (most recent first)
    });
  }

  // Default sort: open first (by priority), then closed by most recently closed
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
    // Treat NaN/invalid priorities as lowest priority (largest number)
    const aPriority = Number.isFinite(a.priority) ? a.priority : Number.MAX_SAFE_INTEGER;
    const bPriority = Number.isFinite(b.priority) ? b.priority : Number.MAX_SAFE_INTEGER;
    return aPriority - bPriority;
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

/**
 * Truncates a title to fit within the specified width, adding an ellipsis if needed.
 * Note: Uses string length (UTF-16 code units), not visual display width. Titles with
 * emoji or wide Unicode characters may not truncate perfectly to the visual width.
 */
export function truncateTitle(title: string, maxWidth: number): string {
  if (maxWidth <= 0) return '';
  if (title.length <= maxWidth) return title;
  if (maxWidth === 1) return '\u2026'; // Only room for ellipsis
  return `${title.slice(0, maxWidth - 1)}\u2026`;
}

/**
 * Determines whether a tree node should be auto-expanded in Recent view.
 * Returns true only if the issue has at least one non-closed descendant.
 * This prevents expanding epics/parents where all work is complete.
 *
 * @param issue - The issue (tree node) to check for auto-expansion
 * @param allIssues - All issues in the current view (needed to find children)
 * @param visited - Internal: Set of already-visited issue IDs for cycle detection
 * @returns true if the node should be auto-expanded, false otherwise
 */
export function shouldAutoExpandInRecent(
  issue: BeadsIssue,
  allIssues: BeadsIssue[],
  visited: Set<string> = new Set(),
): boolean {
  // Cycle detection: if we've already visited this node, break the cycle
  if (visited.has(issue.id)) {
    return false;
  }

  // Mark this node as visited
  visited.add(issue.id);

  // Get direct children of this issue (issues that have this issue as a parent)
  const children = allIssues.filter((i) => i.parentIds.includes(issue.id));

  // Check if any child (or its descendants) qualifies for expansion
  return children.some((child) => {
    // Any non-closed child qualifies for expansion
    if (child.status !== 'closed') {
      return true;
    }
    // Recurse into child's subtree to find non-closed descendants
    return shouldAutoExpandInRecent(child, allIssues, visited);
  });
}

/**
 * Sort issues for Recent view children.
 * Order: non-closed issues first (by priority), then closed issues (by priority).
 *
 * @deprecated Use sortIssuesForRecentView instead - it applies consistent sorting
 * (epics first, then non-closed by priority, then closed by priority) at all tree levels.
 *
 * @param issues - Issues to sort
 * @returns New sorted array (does not mutate input)
 */
export function sortChildrenForRecentView<T extends SortableIssue>(issues: T[]): T[] {
  return [...issues].sort((a, b) => {
    // Non-closed before closed
    const aOpen = a.status !== 'closed';
    const bOpen = b.status !== 'closed';
    if (aOpen && !bOpen) return -1;
    if (!aOpen && bOpen) return 1;
    // Same status group: sort by priority (lower = higher priority)
    // Treat NaN/invalid priorities as lowest priority (largest number)
    const aPriority = Number.isFinite(a.priority) ? a.priority : Number.MAX_SAFE_INTEGER;
    const bPriority = Number.isFinite(b.priority) ? b.priority : Number.MAX_SAFE_INTEGER;
    return aPriority - bPriority;
  });
}

/**
 * Minimum interface for issues that can be sorted as root issues in Recent view.
 * Extends SortableIssue with issue_type for epic detection.
 */
export interface RootSortableIssue extends SortableIssue {
  issue_type: string;
}

/**
 * Sort root issues for Recent view.
 * Epics are sorted by updated_at (most recent first) and placed before non-epics.
 * Non-epics are sorted by status/priority (non-closed first, then by priority).
 *
 * @deprecated Use sortIssuesForRecentView instead - it applies the same sorting at all tree levels
 * @param issues - Root issues to sort
 * @returns New sorted array (does not mutate input)
 */
export function sortRootIssuesForRecentView<T extends RootSortableIssue>(issues: T[]): T[] {
  return sortIssuesForRecentView(issues);
}

/**
 * Sort issues for Recent view at any tree level.
 * Applies consistent sorting: epics first (by updated_at), then non-closed (by priority),
 * then closed (by priority).
 *
 * @param issues - Issues to sort (at any level: root, children, grandchildren, etc.)
 * @returns New sorted array (does not mutate input)
 */
export function sortIssuesForRecentView<T extends RootSortableIssue>(issues: T[]): T[] {
  const epics = issues.filter((i) => i.issue_type === 'epic');
  const nonEpics = issues.filter((i) => i.issue_type !== 'epic');

  // Sort epics by updated_at (most recent first)
  const sortedEpics = [...epics].sort((a, b) => {
    const aTime = new Date(a.updated_at).getTime();
    const bTime = new Date(b.updated_at).getTime();
    // Treat NaN as 0 (oldest)
    const safeATime = Number.isNaN(aTime) ? 0 : aTime;
    const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
    return safeBTime - safeATime; // Descending (most recent first)
  });

  // Sort non-epics: non-closed first by priority, then closed by priority
  const sortedNonEpics = [...nonEpics].sort((a, b) => {
    const aOpen = a.status !== 'closed';
    const bOpen = b.status !== 'closed';
    if (aOpen && !bOpen) return -1;
    if (!aOpen && bOpen) return 1;
    // Same status group: sort by priority (lower = higher priority)
    const aPriority = Number.isFinite(a.priority) ? a.priority : Number.MAX_SAFE_INTEGER;
    const bPriority = Number.isFinite(b.priority) ? b.priority : Number.MAX_SAFE_INTEGER;
    return aPriority - bPriority;
  });

  // Combine: epics first (by recency), then non-epics (by status/priority)
  return [...sortedEpics, ...sortedNonEpics];
}
