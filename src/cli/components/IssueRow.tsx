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

const DEFAULT_TERMINAL_WIDTH = 80;

export function IssueRow({
  issue,
  depth,
  isExpanded,
  hasChildren,
  isSelected,
  isLastChild,
}: IssueRowProps) {
  const { width: rawWidth } = useTerminalDimensions();
  // Use sensible fallback if terminal width is invalid (non-TTY, initialization)
  const terminalWidth = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : DEFAULT_TERMINAL_WIDTH;

  // Build tree prefix
  const prefix = buildTreePrefix(depth, hasChildren, isExpanded, isLastChild);

  // Status icon and color
  const statusIcon = getStatusIcon(issue.status);
  const statusColor = getStatusColor(issue.status);

  // Type icon
  const typeIcon = getTypeIcon(issue.issue_type);

  // Priority display
  const priorityStr = `P${issue.priority}`;

  // Time ago: closed issues show closed_at, epics show updated_at
  const timeAgo =
    issue.status === 'closed' && issue.closed_at
      ? formatTimeAgo(issue.closed_at)
      : issue.issue_type === 'epic' && issue.updated_at
        ? formatTimeAgo(issue.updated_at)
        : '';

  // Shorten ID (take last part after hyphen)
  const shortId = getShortId(issue.id);

  // Calculate available width for title
  // Format: [prefix][status][space][priority][space][type][space][id][space][title][padding][timeAgo]
  // Note: Width calculation uses character count which may be imprecise for Unicode
  // characters that render wider than 1 cell (e.g., some emoji, CJK characters).
  // This is a best-effort approximation that works well for most ASCII titles.
  const prefixLen = prefix.length;
  const statusLen = 1; // status icon (Unicode symbols render as ~1 cell)
  const priorityLen = priorityStr.length;
  const typeLen = 2; // emoji typically renders as 2 cells in most terminals
  const idLen = (shortId || '').length;
  const spacesLen = 4; // 4 spaces between elements
  const timeAgoDisplayLen = timeAgo ? timeAgo.length + 2 : 0; // "(timeAgo)" at right edge

  const fixedWidth = prefixLen + statusLen + priorityLen + typeLen + idLen + spacesLen + timeAgoDisplayLen;
  const availableWidth = Math.max(0, terminalWidth - fixedWidth);

  // Truncate title if needed
  const displayTitle = truncateTitle(issue.title, availableWidth);

  // Calculate padding to push timeAgo to right edge
  const titleDisplayLen = displayTitle.length;
  const paddingLen = Math.max(1, availableWidth - titleDisplayLen);
  const padding = ' '.repeat(paddingLen);

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
        {timeAgo && <span fg="gray">{padding}({timeAgo})</span>}
      </text>
    </box>
  );
}

const MAX_TREE_DEPTH = 20; // Reasonable limit for tree visualization

function buildTreePrefix(
  depth: number,
  hasChildren: boolean,
  isExpanded: boolean,
  isLastChild: boolean,
): string {
  // Validate and clamp depth to prevent invalid values or runaway loops
  const safeDepth = Number.isInteger(depth) && depth >= 0 ? Math.min(depth, MAX_TREE_DEPTH) : 0;

  if (safeDepth === 0) {
    if (hasChildren) {
      return isExpanded ? '▼ ' : '▶ ';
    }
    return '  ';
  }

  // Build indentation with tree connectors
  let prefix = '';
  for (let i = 0; i < safeDepth - 1; i++) {
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

