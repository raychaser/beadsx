// Single issue row component

import { useTerminalDimensions } from '@opentui/react';
import type { BeadsIssue } from '../../core';
import { formatTimeAgo, truncateTitle } from '../../core';
import { getShortId, getStatusColor, getStatusIcon, getTypeIcon } from '../constants';

interface IssueRowProps {
  issue: BeadsIssue;
  depth: number;
  isExpanded: boolean;
  hasChildren: boolean;
  isSelected: boolean;
  isLastChild: boolean;
}

export function IssueRow({
  issue,
  depth,
  isExpanded,
  hasChildren,
  isSelected,
  isLastChild,
}: IssueRowProps) {
  const { width: terminalWidth } = useTerminalDimensions();

  // Build tree prefix
  const prefix = buildTreePrefix(depth, hasChildren, isExpanded, isLastChild);

  // Status icon and color
  const statusIcon = getStatusIcon(issue.status);
  const statusColor = getStatusColor(issue.status);

  // Type icon
  const typeIcon = getTypeIcon(issue.issue_type);

  // Priority display
  const priorityStr = `P${issue.priority}`;

  // Time ago for closed issues
  const timeAgo = issue.status === 'closed' && issue.closed_at ? formatTimeAgo(issue.closed_at) : '';

  // Shorten ID (take last part after hyphen)
  const shortId = getShortId(issue.id);

  // Calculate available width for title
  // Format: [prefix][status][space][priority][space][type][space][id][space][title][optional: space + (timeAgo)]
  // Note: Width calculation uses character count which may be imprecise for Unicode
  // characters that render wider than 1 cell (e.g., some emoji, CJK characters).
  // This is a best-effort approximation that works well for most ASCII titles.
  const prefixLen = prefix.length;
  const statusLen = 1; // status icon (Unicode symbols render as ~1 cell)
  const priorityLen = priorityStr.length;
  const typeLen = 2; // emoji typically renders as 2 cells in most terminals
  const idLen = (shortId || '').length;
  const spacesLen = 4; // 4 spaces between elements
  const timeAgoLen = timeAgo ? timeAgo.length + 3 : 0; // " (timeAgo)"

  const fixedWidth = prefixLen + statusLen + priorityLen + typeLen + idLen + spacesLen + timeAgoLen;
  const availableWidth = Math.max(0, terminalWidth - fixedWidth);

  // Truncate title if needed
  const displayTitle = truncateTitle(issue.title, availableWidth);

  // Build the row
  const bgColor = isSelected ? 'blue' : undefined;

  return (
    <box style={{ height: 1 }}>
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
        <span fg={issue.status === 'closed' ? 'gray' : 'white'}>{displayTitle}</span>
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

