// Detail view component for showing full issue information

import type { BeadsIssue } from '../../core';
import { formatTimeAgo, getAllAncestors, getChildren, sortIssues } from '../../core';
import { getStatusColor, getStatusIcon, getTypeIcon } from '../constants';

interface DetailViewProps {
  issue: BeadsIssue;
  allIssues: BeadsIssue[];
  selectedChildIndex: number;
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
  const ancestors = getAllAncestors(issue, allIssues);
  const children = sortIssues(getChildren(issue, allIssues));
  const openChildren = children.filter((c) => c.status !== 'closed');
  const closedChildren = children.filter((c) => c.status === 'closed');

  const statusIcon = getStatusIcon(issue.status);
  const statusColor = getStatusColor(issue.status);
  const typeIcon = getTypeIcon(issue.issue_type);

  return (
    <box flexDirection="column">
      {/* Breadcrumbs */}
      {ancestors.length > 0 && (
        <box style={{ height: 1 }}>
          <text fg="gray">
            {ancestors.map((a) => a.title).join(' › ')} › <span fg="white">{issue.title}</span>
          </text>
        </box>
      )}

      {/* Header */}
      <box style={{ height: 1 }}>
        <text fg="gray">{issue.id}</text>
      </box>
      <box style={{ height: 1 }}>
        <text bold fg="white">
          {issue.title}
        </text>
      </box>
      <box style={{ height: 1 }}>
        <text> </text>
      </box>

      {/* Metadata grid */}
      <box style={{ height: 1 }}>
        <text>
          <span fg="gray">Type: </span>
          <span>{typeIcon} {issue.issue_type}</span>
          <span>    </span>
          <span fg="gray">Status: </span>
          <span fg={statusColor}>{statusIcon} {issue.status.replace('_', ' ')}</span>
        </text>
      </box>
      <box style={{ height: 1 }}>
        <text>
          <span fg="gray">Priority: </span>
          <span fg="cyan">P{issue.priority}</span>
          <span>    </span>
          <span fg="gray">Assignee: </span>
          <span>{issue.assignee || 'Unassigned'}</span>
        </text>
      </box>
      <box style={{ height: 1 }}>
        <text>
          <span fg="gray">Created: </span>
          <span>{formatDate(issue.created_at)}</span>
        </text>
      </box>
      <box style={{ height: 1 }}>
        <text>
          <span fg="gray">Updated: </span>
          <span>{formatDate(issue.updated_at)}</span>
        </text>
      </box>
      {issue.closed_at && (
        <box style={{ height: 1 }}>
          <text>
            <span fg="gray">Closed: </span>
            <span>{formatDate(issue.closed_at)}</span>
          </text>
        </box>
      )}
      {issue.labels && issue.labels.length > 0 && (
        <box style={{ height: 1 }}>
          <text>
            <span fg="gray">Labels: </span>
            <span>{issue.labels.join(', ')}</span>
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
            <text fg="white" bold>
              Description
            </text>
          </box>
          <box style={{ height: 1 }}>
            <text fg="gray">────────────────────────────────────────</text>
          </box>
          <box>
            <text>{issue.description}</text>
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
            <text fg="white" bold>
              Children ({children.length})
            </text>
          </box>
          <box style={{ height: 1 }}>
            <text fg="gray">────────────────────────────────────────</text>
          </box>

          {/* Open children */}
          {openChildren.length > 0 && (
            <>
              <box style={{ height: 1 }}>
                <text fg="gray">Open ({openChildren.length})</text>
              </box>
              {openChildren.map((child, idx) => {
                const isSelected = idx === selectedChildIndex;
                const childStatusIcon = getStatusIcon(child.status);
                const childStatusColor = getStatusColor(child.status);
                const shortId = child.id.includes('-') ? child.id.split('-').pop() : child.id;
                const timeAgo =
                  child.status === 'closed' && child.closed_at ? ` (${formatTimeAgo(child.closed_at)})` : '';

                return (
                  <box key={child.id} style={{ height: 1 }}>
                    <text bg={isSelected ? 'blue' : undefined}>
                      <span>  </span>
                      <span fg={childStatusColor}>{childStatusIcon}</span>
                      <span> </span>
                      <span fg="gray">{shortId}</span>
                      <span> </span>
                      <span fg={child.status === 'closed' ? 'gray' : 'white'}>{child.title}</span>
                      {timeAgo && <span fg="gray">{timeAgo}</span>}
                    </text>
                  </box>
                );
              })}
            </>
          )}

          {/* Closed children */}
          {closedChildren.length > 0 && (
            <>
              <box style={{ height: 1 }}>
                <text fg="gray">Closed ({closedChildren.length})</text>
              </box>
              {closedChildren.map((child, idx) => {
                const globalIdx = openChildren.length + idx;
                const isSelected = globalIdx === selectedChildIndex;
                const childStatusIcon = getStatusIcon(child.status);
                const childStatusColor = getStatusColor(child.status);
                const shortId = child.id.includes('-') ? child.id.split('-').pop() : child.id;
                const timeAgo =
                  child.status === 'closed' && child.closed_at ? ` (${formatTimeAgo(child.closed_at)})` : '';

                return (
                  <box key={child.id} style={{ height: 1 }}>
                    <text bg={isSelected ? 'blue' : undefined}>
                      <span>  </span>
                      <span fg={childStatusColor}>{childStatusIcon}</span>
                      <span> </span>
                      <span fg="gray">{shortId}</span>
                      <span> </span>
                      <span fg="gray">{child.title}</span>
                      {timeAgo && <span fg="gray">{timeAgo}</span>}
                    </text>
                  </box>
                );
              })}
            </>
          )}
        </>
      )}

      {/* Help text */}
      <box style={{ height: 1 }}>
        <text> </text>
      </box>
      <box style={{ height: 1 }}>
        <text fg="gray">
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
