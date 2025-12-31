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

  // Check if an issue is the last child of its parent
  const isLastChild = (issue: BeadsIssue): boolean => {
    if (!issue.parentId) {
      // Root level: check if last root
      const roots = visibleIssues.filter((i) => !i.parentId);
      return roots[roots.length - 1]?.id === issue.id;
    }
    // Find siblings
    const siblings = visibleIssues.filter((i) => i.parentId === issue.parentId);
    return siblings[siblings.length - 1]?.id === issue.id;
  };

  // Slice visible issues based on scroll offset and tree height
  const displayedIssues = visibleIssues.slice(scrollOffset, scrollOffset + treeHeight);

  return (
    <box flexDirection="column">
      {displayedIssues.map((issue) => {
        // Find original index in visibleIssues for selection state
        const originalIndex = visibleIssues.indexOf(issue);
        return (
          <IssueRow
            key={issue.id}
            issue={issue}
            depth={depthMap.get(issue.id) ?? 0}
            isExpanded={expandedIds.has(issue.id)}
            hasChildren={childrenSet.has(issue.id)}
            isSelected={originalIndex === selectedIndex}
            isLastChild={isLastChild(issue)}
          />
        );
      })}
    </box>
  );
}
