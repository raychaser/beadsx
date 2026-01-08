// Detail view component for showing full issue information

import type { BeadsIssue } from '../../core';
import { formatTimeAgo, getAllAncestors, getChildren, sortIssues } from '../../core';
import { getShortId, getStatusColor, getStatusIcon, getTypeIcon } from '../constants';
import { useTheme } from '../theme';

interface DetailViewProps {
  issue: BeadsIssue;
  allIssues: BeadsIssue[];
  selectedChildIndex: number;
}

interface ChildIssueRowProps {
  child: BeadsIssue;
  isSelected: boolean;
}

/**
 * Renders a single child issue row with status icon, ID, and title.
 */
function ChildIssueRow({ child, isSelected }: ChildIssueRowProps) {
  const theme = useTheme();
  const statusIcon = getStatusIcon(child.status);
  const statusColor = getStatusColor(child.status, theme);
  const shortId = getShortId(child.id);
  const timeAgo = child.status === 'closed' && child.closed_at ? ` (${formatTimeAgo(child.closed_at)})` : '';

  // In light mode, we need high contrast (white text on blue bg)
  // In dark mode, original colors are readable on blue background
  const isLightMode = theme.mode === 'light';

  // Use inverse colors when selected in light mode for better contrast
  // In dark mode, keep original colors as they're readable on blue background
  const needsInverse = isSelected && isLightMode;
  const textColor = needsInverse ? theme.textInverse : theme.textPrimary;
  const mutedColor = needsInverse ? theme.textInverse : theme.textMuted;
  const titleColor = child.status === 'closed' ? mutedColor : textColor;

  return (
    <box key={child.id} style={{ height: 1 }}>
      <text bg={isSelected ? theme.selectionBg : undefined}>
        <span>  </span>
        <span fg={statusColor}>{statusIcon}</span>
        <span> </span>
        <span fg={mutedColor}>{shortId}</span>
        <span> </span>
        <span fg={titleColor}>{child.title}</span>
        {timeAgo && <span fg={mutedColor}>{timeAgo}</span>}
      </text>
    </box>
  );
}

/**
 * Format a date string for display.
 * Validates the date and logs warnings for invalid values.
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);

  // Date constructor doesn't throw - it returns Invalid Date
  if (Number.isNaN(date.getTime())) {
    console.warn(`[DetailView] Invalid date string: "${dateStr}"`);
    return dateStr;
  }

  try {
    return date.toLocaleString();
  } catch (err) {
    // toLocaleString can throw RangeError for extreme dates
    console.warn(`[DetailView] Failed to format date "${dateStr}": ${err}`);
    return dateStr;
  }
}

export function DetailView({ issue, allIssues, selectedChildIndex }: DetailViewProps) {
  const theme = useTheme();
  const ancestors = getAllAncestors(issue, allIssues);
  const children = sortIssues(getChildren(issue, allIssues));
  const openChildren = children.filter((c) => c.status !== 'closed');
  const closedChildren = children.filter((c) => c.status === 'closed');

  const statusIcon = getStatusIcon(issue.status);
  const statusColor = getStatusColor(issue.status, theme);
  const typeIcon = getTypeIcon(issue.issue_type);

  return (
    <box flexDirection="column">
      {/* Breadcrumbs */}
      {ancestors.length > 0 && (
        <box style={{ height: 1 }}>
          <text fg={theme.textMuted}>
            {ancestors.map((a) => a.title).join(' › ')} › <span fg={theme.textPrimary}>{issue.title}</span>
          </text>
        </box>
      )}

      {/* Header */}
      <box style={{ height: 1 }}>
        <text fg={theme.textMuted}>{issue.id}</text>
      </box>
      <box style={{ height: 1 }}>
        <text bold fg={theme.textPrimary}>
          {issue.title}
        </text>
      </box>
      <box style={{ height: 1 }}>
        <text> </text>
      </box>

      {/* Metadata grid */}
      <box style={{ height: 1 }}>
        <text>
          <span fg={theme.textMuted}>Type: </span>
          <span fg={theme.textPrimary}>{typeIcon} {issue.issue_type}</span>
          <span>    </span>
          <span fg={theme.textMuted}>Status: </span>
          <span fg={statusColor}>{statusIcon} {issue.status.replace('_', ' ')}</span>
        </text>
      </box>
      <box style={{ height: 1 }}>
        <text>
          <span fg={theme.textMuted}>Priority: </span>
          <span fg={theme.accent}>P{issue.priority}</span>
          <span>    </span>
          <span fg={theme.textMuted}>Assignee: </span>
          <span fg={theme.textPrimary}>{issue.assignee || 'Unassigned'}</span>
        </text>
      </box>
      <box style={{ height: 1 }}>
        <text>
          <span fg={theme.textMuted}>Created: </span>
          <span fg={theme.textPrimary}>{formatDate(issue.created_at)}</span>
        </text>
      </box>
      <box style={{ height: 1 }}>
        <text>
          <span fg={theme.textMuted}>Updated: </span>
          <span fg={theme.textPrimary}>{formatDate(issue.updated_at)}</span>
        </text>
      </box>
      {issue.closed_at && (
        <box style={{ height: 1 }}>
          <text>
            <span fg={theme.textMuted}>Closed: </span>
            <span fg={theme.textPrimary}>{formatDate(issue.closed_at)}</span>
          </text>
        </box>
      )}
      {issue.labels && issue.labels.length > 0 && (
        <box style={{ height: 1 }}>
          <text>
            <span fg={theme.textMuted}>Labels: </span>
            <span fg={theme.textPrimary}>{issue.labels.join(', ')}</span>
          </text>
        </box>
      )}

      {/* Description */}
      {issue.description && (
        <>
          <box style={{ height: 1 }}>
            <text> </text>
          </box>
          <box style={{ height: 1 }}>
            <text fg={theme.textPrimary} bold>
              Description
            </text>
          </box>
          <box style={{ height: 1 }}>
            <text fg={theme.border}>────────────────────────────────────────</text>
          </box>
          <box>
            <text fg={theme.textPrimary}>{issue.description}</text>
          </box>
        </>
      )}

      {/* Children */}
      {children.length > 0 && (
        <>
          <box style={{ height: 1 }}>
            <text> </text>
          </box>
          <box style={{ height: 1 }}>
            <text fg={theme.textPrimary} bold>
              Children ({children.length})
            </text>
          </box>
          <box style={{ height: 1 }}>
            <text fg={theme.border}>────────────────────────────────────────</text>
          </box>

          {/* Open children */}
          {openChildren.length > 0 && (
            <>
              <box style={{ height: 1 }}>
                <text fg={theme.textMuted}>Open ({openChildren.length})</text>
              </box>
              {openChildren.map((child, idx) => (
                <ChildIssueRow key={child.id} child={child} isSelected={idx === selectedChildIndex} />
              ))}
            </>
          )}

          {/* Closed children */}
          {closedChildren.length > 0 && (
            <>
              <box style={{ height: 1 }}>
                <text fg={theme.textMuted}>Closed ({closedChildren.length})</text>
              </box>
              {closedChildren.map((child, idx) => (
                <ChildIssueRow
                  key={child.id}
                  child={child}
                  isSelected={openChildren.length + idx === selectedChildIndex}
                />
              ))}
            </>
          )}
        </>
      )}

      {/* Help text */}
      <box style={{ height: 1 }}>
        <text> </text>
      </box>
      <box style={{ height: 1 }}>
        <text fg={theme.textMuted}>
          {children.length > 0 ? 'j/k: select child  Enter: drill in  ' : ''}ESC: back
        </text>
      </box>
    </box>
  );
}

// Export helper to get selectable children count
export function getSelectableChildrenCount(issue: BeadsIssue, allIssues: BeadsIssue[]): number {
  return getChildren(issue, allIssues).length;
}

// Export helper to get selected child
export function getSelectedChild(
  issue: BeadsIssue,
  allIssues: BeadsIssue[],
  selectedChildIndex: number,
): BeadsIssue | null {
  const children = sortIssues(getChildren(issue, allIssues));

  // No children is a legitimate case
  if (children.length === 0) {
    return null;
  }

  // Build selectable list (open first, then closed)
  const openChildren = children.filter((c) => c.status !== 'closed');
  const closedChildren = children.filter((c) => c.status === 'closed');
  const selectableChildren = [...openChildren, ...closedChildren];

  // Out-of-bounds index is a programming error - log it
  if (selectedChildIndex < 0 || selectedChildIndex >= selectableChildren.length) {
    console.warn(
      `[DetailView] selectedChildIndex (${selectedChildIndex}) out of bounds for ${selectableChildren.length} children`,
    );
    return null;
  }

  return selectableChildren[selectedChildIndex];
}
