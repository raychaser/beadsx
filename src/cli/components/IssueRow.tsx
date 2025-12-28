// Single issue row component

import type { BeadsIssue } from '../../core';
import { formatTimeAgo } from '../../core';

interface IssueRowProps {
  issue: BeadsIssue;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isSelected: boolean;
  isLastChild: boolean;
}

// Status indicators
const STATUS_ICONS: Record<string, string> = {
  closed: '✓',
  in_progress: '●',
  blocked: '✖',
  open: '○',
};

// Issue type icons (similar to VS Code extension)
const TYPE_ICONS: Record<string, string> = {
  bug: '🐛',
  feature: '💡',
  epic: '🚀',
  chore: '🔧',
  task: '📋',
};

export function IssueRow({
  issue,
  depth,
  isExpanded,
  hasChildren,
  isSelected,
  isLastChild,
}: IssueRowProps) {
  // Build tree prefix
  const prefix = buildTreePrefix(depth, hasChildren, isExpanded, isLastChild);

  // Status icon and color
  const statusIcon = STATUS_ICONS[issue.status] || '○';
  const statusColor = getStatusColor(issue.status);

  // Type icon
  const typeIcon = TYPE_ICONS[issue.issue_type] || '📋';

  // Priority display
  const priorityStr = `P${issue.priority}`;

  // Time ago for closed issues
  const timeAgo = issue.status === 'closed' && issue.closed_at ? formatTimeAgo(issue.closed_at) : '';

  // Shorten ID (take last part after hyphen)
  const shortId = issue.id.includes('-') ? issue.id.split('-').pop() : issue.id;

  // Build the row
  const bgColor = isSelected ? 'blue' : undefined;

  return (
    <box>
      <text bg={bgColor}>
        <span fg="gray">{prefix}</span>
        <span fg={statusColor}>{statusIcon}</span>
        <span> </span>
        <span fg="cyan">{priorityStr}</span>
        <span> </span>
        <span>{typeIcon}</span>
        <span> </span>
        <span fg="gray">{shortId}</span>
        <span> </span>
        <span fg={issue.status === 'closed' ? 'gray' : 'white'}>{issue.title}</span>
        {timeAgo && <span fg="gray"> ({timeAgo})</span>}
      </text>
    </box>
  );
}

function buildTreePrefix(
  depth: number,
  hasChildren: boolean,
  isExpanded: boolean,
  isLastChild: boolean,
): string {
  if (depth === 0) {
    if (hasChildren) {
      return isExpanded ? '▼ ' : '▶ ';
    }
    return '  ';
  }

  // Build indentation with tree connectors
  let prefix = '';
  for (let i = 0; i < depth - 1; i++) {
    prefix += '│  ';
  }

  // Add connector for this level
  if (isLastChild) {
    prefix += '└─ ';
  } else {
    prefix += '├─ ';
  }

  // Add expand indicator if has children
  if (hasChildren) {
    prefix = prefix.slice(0, -1) + (isExpanded ? '▼' : '▶');
  }

  return prefix;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'closed':
      return 'green';
    case 'in_progress':
      return 'yellow';
    case 'blocked':
      return 'red';
    default:
      return 'white';
  }
}
