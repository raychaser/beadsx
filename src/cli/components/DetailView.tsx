// Detail view component for showing full issue information

import type { BeadsIssue } from '../../core';
import { formatTimeAgo, getAllAncestors, getChildren, sortIssues } from '../../core';

interface DetailViewProps {
  issue: BeadsIssue;
  allIssues: BeadsIssue[];
  selectedChildIndex: number;
}

// Status indicators (same as IssueRow)
const STATUS_ICONS: Record<string, string> = {
  closed: '✓',
  in_progress: '●',
  blocked: '✖',
  open: '○',
};

// Type icons (same as IssueRow)
const TYPE_ICONS: Record<string, string> = {
  bug: '🐛',
  feature: '💡',
  epic: '🚀',
  chore: '🔧',
  task: '📋',
};

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

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

export function DetailView({ issue, allIssues, selectedChildIndex }: DetailViewProps) {
  const ancestors = getAllAncestors(issue, allIssues);
  const children = sortIssues(getChildren(issue, allIssues));
  const openChildren = children.filter((c) => c.status !== 'closed');
  const closedChildren = children.filter((c) => c.status === 'closed');

  // Build flat list of children for selection (open first, then closed)
  const selectableChildren = [...openChildren, ...closedChildren];

  const statusIcon = STATUS_ICONS[issue.status] || '○';
  const statusColor = getStatusColor(issue.status);
  const typeIcon = TYPE_ICONS[issue.issue_type] || '📋';

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
                const globalIdx = idx;
                const isSelected = globalIdx === selectedChildIndex;
                const childStatusIcon = STATUS_ICONS[child.status] || '○';
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
                const childStatusIcon = STATUS_ICONS[child.status] || '○';
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
  const openChildren = children.filter((c) => c.status !== 'closed');
  const closedChildren = children.filter((c) => c.status === 'closed');
  const selectableChildren = [...openChildren, ...closedChildren];
  return selectableChildren[selectedChildIndex] || null;
}
