// Issue tree component

import { useMemo } from 'react';
import type { BeadsIssue } from '../../core';
import { computeIssueDepths } from '../../core/utils';
import { IssueRow } from './IssueRow';

interface IssueTreeProps {
  issues: BeadsIssue[];
  visibleIssues: BeadsIssue[];
  expandedIds: Set<string>;
  selectedIndex: number;
  scrollOffset: number;
  treeHeight: number;
}

export function IssueTree({
  issues,
  visibleIssues,
  expandedIds,
  selectedIndex,
  scrollOffset,
  treeHeight,
}: IssueTreeProps) {
  // Pre-compute depths using memoized Map for O(1) lookups
  const depthMap = useMemo(() => computeIssueDepths(issues), [issues]);

  // Memoize children lookup for O(1) checks
  const childrenSet = useMemo(() => {
    const set = new Set<string>();
    for (const issue of issues) {
      if (issue.parentId) {
        set.add(issue.parentId);
      }
    }
    return set;
  }, [issues]);

  // Memoize index map for O(1) lookups instead of O(n) indexOf calls
  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleIssues.forEach((issue, idx) => map.set(issue.id, idx));
    return map;
  }, [visibleIssues]);

  // Memoize last-child lookup for O(1) checks instead of O(n) filter calls
  const lastChildMap = useMemo(() => {
    // Group issues by parentId and track the last one in each group
    const map = new Map<string | undefined, string>();
    for (const issue of visibleIssues) {
      map.set(issue.parentId ?? undefined, issue.id);
    }
    return map;
  }, [visibleIssues]);

  // Helper to get depth with logging for missing issues
  const getDepth = (issueId: string): number => {
    const depth = depthMap.get(issueId);
    if (depth === undefined) {
      console.warn(`[cli] Issue ${issueId} not found in depth map, rendering at root level`);
      return 0;
    }
    return depth;
  };

  // Helper to get index with logging for missing issues
  const getIndex = (issueId: string): number => {
    const idx = indexMap.get(issueId);
    if (idx === undefined) {
      console.warn(`[cli] Issue ${issueId} not found in index map`);
      return -1;
    }
    return idx;
  };

  // O(1) check if issue is last child of its parent
  const isLastChild = (issue: BeadsIssue): boolean => {
    return lastChildMap.get(issue.parentId ?? undefined) === issue.id;
  };

  // Slice visible issues based on scroll offset and tree height
  const displayedIssues = visibleIssues.slice(scrollOffset, scrollOffset + treeHeight);

  return (
    <box flexDirection="column">
      {displayedIssues.map((issue) => {
        const originalIndex = getIndex(issue.id);
        return (
          <IssueRow
            key={issue.id}
            issue={issue}
            depth={getDepth(issue.id)}
            isExpanded={expandedIds.has(issue.id)}
            hasChildren={childrenSet.has(issue.id)}
            isSelected={originalIndex !== -1 && originalIndex === selectedIndex}
            isLastChild={isLastChild(issue)}
          />
        );
      })}
    </box>
  );
}
