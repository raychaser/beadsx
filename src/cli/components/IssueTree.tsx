// Issue tree component

import { useMemo } from 'react';
import type { BeadsIssue } from '../../core';
import { IssueRow } from './IssueRow';

interface IssueTreeProps {
  issues: BeadsIssue[];
  visibleIssues: BeadsIssue[];
  expandedIds: Set<string>;
  selectedIndex: number;
}

export function IssueTree({ issues, visibleIssues, expandedIds, selectedIndex }: IssueTreeProps) {
  // Pre-compute depths using memoized Map for O(1) lookups
  const depthMap = useMemo(() => {
    const map = new Map<string, number>();
    const issueMap = new Map(issues.map((i) => [i.id, i]));

    const computeDepth = (issue: BeadsIssue): number => {
      if (map.has(issue.id)) return map.get(issue.id)!;
      if (!issue.parentId) {
        map.set(issue.id, 0);
        return 0;
      }
      const parent = issueMap.get(issue.parentId);
      if (!parent) {
        map.set(issue.id, 0);
        return 0;
      }
      const depth = computeDepth(parent) + 1;
      map.set(issue.id, depth);
      return depth;
    };

    for (const issue of issues) {
      computeDepth(issue);
    }
    return map;
  }, [issues]);

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

  return (
    <box flexDirection="column">
      {visibleIssues.map((issue, index) => (
        <IssueRow
          key={issue.id}
          issue={issue}
          depth={depthMap.get(issue.id) ?? 0}
          isExpanded={expandedIds.has(issue.id)}
          hasChildren={childrenSet.has(issue.id)}
          isSelected={index === selectedIndex}
          isLastChild={isLastChild(issue)}
        />
      ))}
    </box>
  );
}
