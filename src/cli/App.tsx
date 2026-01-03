// Main App component for bdx CLI

import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type BeadsIssue,
  type FilterMode,
  type SortMode,
  getRootIssues,
  listFilteredIssues,
  shouldAutoExpandInRecent,
  sortChildrenForRecentView,
  sortIssues,
  sortRootIssuesForRecentView,
} from '../core';
import { DetailView, getSelectableChildrenCount, getSelectedChild } from './components/DetailView';
import { FilterBar } from './components/FilterBar';
import { IssueTree } from './components/IssueTree';
import { StatusBar } from './components/StatusBar';

interface AppProps {
  workspaceRoot: string;
  onQuit?: () => void;
}

const REFRESH_INTERVAL_MS = 5000; // 5 seconds
const DEFAULT_TERMINAL_HEIGHT = 24;

export function App({ workspaceRoot, onQuit }: AppProps) {
  const { height: rawHeight } = useTerminalDimensions();
  // Use sensible fallback if terminal height is invalid
  const terminalHeight = typeof rawHeight === 'number' && rawHeight > 0 ? rawHeight : DEFAULT_TERMINAL_HEIGHT;

  const [issues, setIssues] = useState<BeadsIssue[]>([]);
  const [filter, setFilter] = useState<FilterMode>('recent');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Detail view state
  const [viewMode, setViewMode] = useState<'tree' | 'detail'>('tree');
  const [detailStack, setDetailStack] = useState<string[]>([]); // Stack of issue IDs for navigation history
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);

  // Track user-initiated collapses separately from auto-expanded state
  // This allows us to override user collapse when new non-closed children appear
  const [userCollapsedIds, setUserCollapsedIds] = useState<Set<string>>(new Set());

  // Track previously seen issue IDs to detect new issues on refresh
  const previousIssueIdsRef = useRef<Set<string>>(new Set());

  // Calculate available height for issue tree (terminal - FilterBar - StatusBar)
  const treeHeight = Math.max(1, terminalHeight - 2);

  // Load issues
  const loadIssues = useCallback(async () => {
    try {
      setError(null);
      const result = await listFilteredIssues(workspaceRoot, filter);

      // Handle error from BeadsResult
      if (!result.success) {
        setError(result.error ?? 'Failed to load issues');
        return;
      }

      const loaded = result.data;
      setIssues(loaded);
      setLastRefresh(new Date());

      // Build set of current issue IDs
      const currentIds = new Set(loaded.map((i) => i.id));
      const previousIds = previousIssueIdsRef.current;

      // Determine which issues should be auto-expanded
      const shouldExpandIssue = (issue: BeadsIssue): boolean => {
        const hasChildren = loaded.some((i) => i.parentId === issue.id);
        if (!hasChildren) return false;

        if (filter === 'recent') {
          // For Recent view: expand if issue is in_progress OR subtree contains important work
          return issue.status === 'in_progress' || shouldAutoExpandInRecent(issue, loaded);
        }
        // For other views: expand all non-closed issues with children
        return issue.status !== 'closed';
      };

      if (loading) {
        // Initial load: compute full expansion state
        const toExpand = new Set<string>();
        for (const issue of loaded) {
          if (shouldExpandIssue(issue)) {
            toExpand.add(issue.id);
          }
        }
        setExpandedIds(toExpand);
      } else {
        // Refresh: expand newly-discovered issues AND their parents
        const newIssueIds = new Set([...currentIds].filter((id) => !previousIds.has(id)));

        // Build a map for quick parent lookup
        const issueMap = new Map(loaded.map((i) => [i.id, i]));

        // Helper to check if an issue has any non-closed children
        const hasNonClosedChildren = (issueId: string): boolean => {
          return loaded.some((i) => i.parentId === issueId && i.status !== 'closed');
        };

        // Find user-collapsed parents that now have new non-closed children
        // These should be forcibly expanded (override user collapse)
        const toForceExpand: string[] = [];
        setUserCollapsedIds((prev) => {
          const next = new Set(prev);
          for (const collapsedId of prev) {
            if (hasNonClosedChildren(collapsedId)) {
              // Check if any child is new
              const hasNewChild = loaded.some(
                (i) => i.parentId === collapsedId && newIssueIds.has(i.id) && i.status !== 'closed',
              );
              if (hasNewChild) {
                next.delete(collapsedId);
                toForceExpand.push(collapsedId);
              }
            }
          }
          return next;
        });

        if (newIssueIds.size > 0 || toForceExpand.length > 0) {
          const newToExpand: string[] = [...toForceExpand];

          // Find all ancestors of new issues (with cycle detection)
          const ancestorsOfNewIssues = new Set<string>();
          for (const newIssueId of newIssueIds) {
            const issue = issueMap.get(newIssueId);
            if (issue?.parentId) {
              const visited = new Set<string>(); // Prevent infinite loops from circular parent references
              let parentId: string | undefined = issue.parentId;
              while (parentId && !visited.has(parentId)) {
                visited.add(parentId);
                ancestorsOfNewIssues.add(parentId);
                const parent = issueMap.get(parentId);
                parentId = parent?.parentId;
              }
              // Warn if cycle was detected (data corruption indicator)
              if (parentId && visited.has(parentId)) {
                console.warn(
                  `[warning] Circular parent reference detected for issue "${newIssueId}". ` +
                    `This may indicate data corruption in .beads/issues.jsonl.`,
                );
              }
            }
          }

          // Expand new issues and their ancestors if they meet expansion criteria
          for (const issue of loaded) {
            const isNewOrAncestorOfNew =
              newIssueIds.has(issue.id) || ancestorsOfNewIssues.has(issue.id);
            if (isNewOrAncestorOfNew && shouldExpandIssue(issue)) {
              newToExpand.push(issue.id);
            }
          }

          // Merge with existing expanded IDs (additive only)
          if (newToExpand.length > 0) {
            setExpandedIds((prev) => {
              const next = new Set(prev);
              for (const id of newToExpand) {
                next.add(id);
              }
              return next;
            });
          }
        }
      }

      // Update previous IDs for next refresh
      previousIssueIdsRef.current = currentIds;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[error] Failed to load issues: ${errorMessage}`);
      setError(`Failed to load issues: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [workspaceRoot, filter, loading]);

  // Initial load and refresh on filter change
  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  // Use refs to avoid recreating interval when callbacks change
  const loadIssuesRef = useRef(loadIssues);
  loadIssuesRef.current = loadIssues;
  const setErrorRef = useRef(setError);
  setErrorRef.current = setError;

  // Ref for scroll offset to avoid stale closures in keyboard handlers
  const scrollOffsetRef = useRef(scrollOffset);
  scrollOffsetRef.current = scrollOffset;

  // Auto-refresh timer - uses refs to prevent interval recreation
  // Wraps call in async handler to properly catch any errors and update UI
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await loadIssuesRef.current();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[error] Auto-refresh failed: ${errorMessage}`);
        setErrorRef.current(`Auto-refresh failed: ${errorMessage}`);
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Build flat list of visible issues for navigation
  const getVisibleIssues = useCallback((): BeadsIssue[] => {
    const visible: BeadsIssue[] = [];

    // For Recent view, use special sorting that puts epics first (by update time)
    // and sorts children by non-closed first (by priority), then closed (by priority)
    const isRecentView = filter === 'recent';
    const sortMode: SortMode = isRecentView ? 'recent' : 'default';

    // Get roots with appropriate sorting
    const rawRoots = getRootIssues(issues);
    const roots = isRecentView ? sortRootIssuesForRecentView(rawRoots) : sortIssues(rawRoots, sortMode);

    const addWithChildren = (issue: BeadsIssue, depth: number) => {
      visible.push(issue);
      if (expandedIds.has(issue.id)) {
        const rawChildren = issues.filter((i) => i.parentId === issue.id);
        // For Recent view children, use status/priority sort (non-closed first)
        const children = isRecentView
          ? sortChildrenForRecentView(rawChildren)
          : sortIssues(rawChildren, sortMode);
        for (const child of children) {
          addWithChildren(child, depth + 1);
        }
      }
    };

    for (const root of roots) {
      addWithChildren(root, 0);
    }

    return visible;
  }, [issues, expandedIds, filter]);

  const visibleIssues = getVisibleIssues();
  const selectedIssue = visibleIssues[selectedIndex];

  // Get current detail issue from stack
  const currentDetailIssue =
    viewMode === 'detail' && detailStack.length > 0
      ? issues.find((i) => i.id === detailStack[detailStack.length - 1])
      : null;

  // Keyboard input handling
  useKeyboard((event: KeyEvent) => {
    const key = event.name;

    // Quit - works in both modes
    if (key === 'q') {
      if (onQuit) {
        onQuit();
      } else {
        process.exit(0);
      }
      return;
    }

    // Detail view mode keyboard handling
    if (viewMode === 'detail') {
      if (key === 'escape') {
        // ESC: Go back in navigation history
        setDetailStack((stack) => {
          const newStack = stack.slice(0, -1);
          if (newStack.length === 0) {
            setViewMode('tree');
          }
          setSelectedChildIndex(0);
          return newStack;
        });
      } else if (key === 'up' || key === 'k') {
        // Navigate children
        if (currentDetailIssue) {
          const childCount = getSelectableChildrenCount(currentDetailIssue, issues);
          if (childCount > 0) {
            setSelectedChildIndex((i) => Math.max(0, i - 1));
          }
        }
      } else if (key === 'down' || key === 'j') {
        // Navigate children
        if (currentDetailIssue) {
          const childCount = getSelectableChildrenCount(currentDetailIssue, issues);
          if (childCount > 0) {
            setSelectedChildIndex((i) => Math.min(childCount - 1, i + 1));
          }
        }
      } else if (key === 'return') {
        // Enter: Drill into selected child
        if (currentDetailIssue) {
          const selectedChild = getSelectedChild(currentDetailIssue, issues, selectedChildIndex);
          if (selectedChild) {
            setDetailStack((stack) => [...stack, selectedChild.id]);
            setSelectedChildIndex(0);
          }
        }
      }
      return;
    }

    // Tree view mode keyboard handling
    // Navigation with scroll handling (uses ref to avoid stale closure)
    if (key === 'up' || key === 'k') {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        // Scroll up if selection moves above visible area
        if (newIndex < scrollOffsetRef.current) {
          setScrollOffset(newIndex);
        }
        return newIndex;
      });
    } else if (key === 'down' || key === 'j') {
      setSelectedIndex((i) => {
        const newIndex = Math.min(visibleIssues.length - 1, i + 1);
        // Scroll down if selection moves below visible area
        if (newIndex >= scrollOffsetRef.current + treeHeight) {
          setScrollOffset(newIndex - treeHeight + 1);
        }
        return newIndex;
      });
    }

    // Enter: Open detail view
    else if (key === 'return') {
      if (selectedIssue) {
        setDetailStack([selectedIssue.id]);
        setViewMode('detail');
        setSelectedChildIndex(0);
      }
    }

    // Expand/collapse
    else if (key === 'left' || key === 'h') {
      if (selectedIssue && expandedIds.has(selectedIssue.id)) {
        // Track user-initiated collapse
        setUserCollapsedIds((ids) => new Set(ids).add(selectedIssue.id));
        setExpandedIds((ids) => {
          const next = new Set(ids);
          next.delete(selectedIssue.id);
          return next;
        });
      }
    } else if (key === 'right' || key === 'l') {
      if (selectedIssue) {
        const hasChildren = issues.some((i) => i.parentId === selectedIssue.id);
        if (hasChildren) {
          // Clear user-collapsed state when user explicitly expands
          setUserCollapsedIds((ids) => {
            const next = new Set(ids);
            next.delete(selectedIssue.id);
            return next;
          });
          setExpandedIds((ids) => new Set(ids).add(selectedIssue.id));
        }
      }
    }

    // Filter shortcuts - reset selection and scroll on filter change
    else if (key === '1') {
      setFilter('all');
      setSelectedIndex(0);
      setScrollOffset(0);
    } else if (key === '2') {
      setFilter('open');
      setSelectedIndex(0);
      setScrollOffset(0);
    } else if (key === '3') {
      setFilter('ready');
      setSelectedIndex(0);
      setScrollOffset(0);
    } else if (key === '4') {
      setFilter('recent');
      setSelectedIndex(0);
      setScrollOffset(0);
    }

    // Refresh
    else if (key === 'r') {
      loadIssues().catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[error] Manual refresh failed: ${errorMessage}`);
        setError(`Manual refresh failed: ${errorMessage}`);
      });
    }
  });

  // Keep selection and scroll offset in bounds
  useEffect(() => {
    if (selectedIndex >= visibleIssues.length) {
      setSelectedIndex(Math.max(0, visibleIssues.length - 1));
    }
    // Ensure scroll offset is valid
    const maxOffset = Math.max(0, visibleIssues.length - treeHeight);
    if (scrollOffset > maxOffset) {
      setScrollOffset(maxOffset);
    }
  }, [visibleIssues.length, selectedIndex, scrollOffset, treeHeight]);

  return (
    <box flexDirection="column" height={terminalHeight}>
      {viewMode === 'tree' && <FilterBar filter={filter} lastRefresh={lastRefresh} />}
      <box flexDirection="column" flexGrow={1}>
        {error ? (
          <text fg="red">{error}</text>
        ) : loading ? (
          <text>Loading...</text>
        ) : viewMode === 'detail' && currentDetailIssue ? (
          <DetailView
            issue={currentDetailIssue}
            allIssues={issues}
            selectedChildIndex={selectedChildIndex}
          />
        ) : visibleIssues.length === 0 ? (
          <text fg="gray">No issues found</text>
        ) : (
          <IssueTree
            issues={issues}
            visibleIssues={visibleIssues}
            expandedIds={expandedIds}
            scrollOffset={scrollOffset}
            treeHeight={treeHeight}
            selectedIndex={selectedIndex}
          />
        )}
      </box>
      {viewMode === 'tree' && (
        <StatusBar issues={issues} scrollInfo={{ offset: scrollOffset, visible: treeHeight, total: visibleIssues.length }} />
      )}
    </box>
  );
}
