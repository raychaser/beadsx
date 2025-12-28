// Main App component for bdx CLI

import { useKeyboard } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';
import { useCallback, useEffect, useState } from 'react';
import {
  type BeadsIssue,
  type FilterMode,
  getRootIssues,
  listFilteredIssues,
  sortIssues,
} from '../core';
import { FilterBar } from './components/FilterBar';
import { IssueTree } from './components/IssueTree';
import { StatusBar } from './components/StatusBar';

interface AppProps {
  workspaceRoot: string;
}

const REFRESH_INTERVAL_MS = 5000; // 5 seconds

export function App({ workspaceRoot }: AppProps) {
  const [issues, setIssues] = useState<BeadsIssue[]>([]);
  const [filter, setFilter] = useState<FilterMode>('recent');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  // Load issues
  const loadIssues = useCallback(async () => {
    try {
      const loaded = await listFilteredIssues(workspaceRoot, filter);
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
      // Error already logged by core service
    } finally {
      setLoading(false);
    }
  }, [workspaceRoot, filter, loading]);

  // Initial load and refresh on filter change
  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  // Auto-refresh timer
  useEffect(() => {
    const interval = setInterval(loadIssues, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadIssues]);

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

  // Keyboard input handling
  useKeyboard((event: KeyEvent) => {
    const key = event.name;

    // Navigation
    if (key === 'up' || key === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key === 'down' || key === 'j') {
      setSelectedIndex((i) => Math.min(visibleIssues.length - 1, i + 1));
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
      loadIssues();
    }

    // Quit
    else if (key === 'q') {
      process.exit(0);
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
      <FilterBar filter={filter} lastRefresh={lastRefresh} />
      <box flexDirection="column" flexGrow={1}>
        {loading ? (
          <text>Loading...</text>
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
      <StatusBar issues={issues} />
    </box>
  );
}
