// Issue tree component

import type { BeadsIssue } from '../../core';
import { IssueRow } from './IssueRow';

interface IssueTreeProps {
  issues: BeadsIssue[];
  visibleIssues: BeadsIssue[];
  expandedIds: Set<string>;
  selectedIndex: number;
}

export function IssueTree({ issues, visibleIssues, expandedIds, selectedIndex }: IssueTreeProps) {
  // Calculate depth for each visible issue
  const getDepth = (issue: BeadsIssue): number => {
    let depth = 0;
    let current = issue;
    while (current.parentId) {
      const parent = issues.find((i) => i.id === current.parentId);
      if (!parent) break;
      depth++;
      current = parent;
    }
    return depth;
  };

  // Check if an issue has children
  const hasChildren = (issue: BeadsIssue): boolean => {
    return issues.some((i) => i.parentId === issue.id);
  };

  // Check if an issue is the last child of its parent
  const isLastChild = (issue: BeadsIssue, index: number): boolean => {
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
          depth={getDepth(issue)}
          isExpanded={expandedIds.has(issue.id)}
          hasChildren={hasChildren(issue)}
          isSelected={index === selectedIndex}
          isLastChild={isLastChild(issue, index)}
        />
      ))}
    </box>
  );
}
