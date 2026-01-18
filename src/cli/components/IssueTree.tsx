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
  // An issue ID is in this set if at least one issue has it as a parent
  const childrenSet = useMemo(() => {
    const set = new Set<string>();
    for (const issue of issues) {
      for (const parentId of issue.parentIds) {
        set.add(parentId);
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
  // With multiple parents, track last child for each parent ID
  const lastChildMap = useMemo(() => {
    const map = new Map<string | undefined, string>();
    for (const issue of visibleIssues) {
      if (issue.parentIds.length === 0) {
        // Root issue
        map.set(undefined, issue.id);
      } else {
        // Track this issue as last child for all its parents
        for (const parentId of issue.parentIds) {
          map.set(parentId, issue.id);
        }
      }
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

  // O(1) check if issue is last child of any of its parents
  // With multiple parents, check if this issue is the last child for any of its parent IDs
  //
  // LIMITATION: For issues with multiple parents, this returns true if the issue is
  // the last child of ANY parent, not the specific parent context being rendered.
  // This means the tree connector visual (└── vs ├──) may be incorrect when an
  // issue appears under multiple parents. A fully correct implementation would
  // require tracking the current parent context during rendering and using
  // position-aware lookups, which would add complexity for a minor visual edge case.
  const isLastChild = (issue: BeadsIssue): boolean => {
    if (issue.parentIds.length === 0) {
      return lastChildMap.get(undefined) === issue.id;
    }
    // Check if it's the last child for any of its parents
    return issue.parentIds.some((parentId) => lastChildMap.get(parentId) === issue.id);
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
