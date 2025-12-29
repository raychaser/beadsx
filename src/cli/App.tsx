// Main App component for bdx CLI

import { useKeyboard } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type BeadsIssue,
  type FilterMode,
  getRootIssues,
  listFilteredIssues,
  sortIssues,
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

export function App({ workspaceRoot, onQuit }: AppProps) {
  const [issues, setIssues] = useState<BeadsIssue[]>([]);
  const [filter, setFilter] = useState<FilterMode>('recent');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail view state
  const [viewMode, setViewMode] = useState<'tree' | 'detail'>('tree');
  const [detailStack, setDetailStack] = useState<string[]>([]); // Stack of issue IDs for navigation history
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);

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

      // Auto-expand open/in_progress issues on first load
      if (loading) {
        const toExpand = new Set<string>();
        for (const issue of loaded) {
          if (issue.status !== 'closed') {
            const hasChildren = loaded.some((i) => i.parentId === issue.id);
            if (hasChildren) {
              toExpand.add(issue.id);
            }
          }
        }
        setExpandedIds(toExpand);
      }
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
    const roots = sortIssues(getRootIssues(issues));

    const addWithChildren = (issue: BeadsIssue, depth: number) => {
      visible.push(issue);
      if (expandedIds.has(issue.id)) {
        const children = sortIssues(issues.filter((i) => i.parentId === issue.id));
        for (const child of children) {
          addWithChildren(child, depth + 1);
        }
      }
    };

    for (const root of roots) {
      addWithChildren(root, 0);
    }

    return visible;
  }, [issues, expandedIds]);

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
    // Navigation
    if (key === 'up' || key === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key === 'down' || key === 'j') {
      setSelectedIndex((i) => Math.min(visibleIssues.length - 1, i + 1));
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
          setExpandedIds((ids) => new Set(ids).add(selectedIssue.id));
        }
      }
    }

    // Filter shortcuts
    else if (key === '1') {
      setFilter('all');
      setSelectedIndex(0);
    } else if (key === '2') {
      setFilter('open');
      setSelectedIndex(0);
    } else if (key === '3') {
      setFilter('ready');
      setSelectedIndex(0);
    } else if (key === '4') {
      setFilter('recent');
      setSelectedIndex(0);
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

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= visibleIssues.length) {
      setSelectedIndex(Math.max(0, visibleIssues.length - 1));
    }
  }, [visibleIssues.length, selectedIndex]);

  return (
    <box flexDirection="column">
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
            selectedIndex={selectedIndex}
          />
        )}
      </box>
      {viewMode === 'tree' && <StatusBar issues={issues} />}
    </box>
  );
}
