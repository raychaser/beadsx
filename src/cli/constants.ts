// Shared constants for CLI components

import type { IssueStatus, IssueType } from '../core';

// Status indicators with proper type safety
export const STATUS_ICONS: Record<IssueStatus, string> = {
  closed: '✓',
  in_progress: '●',
  blocked: '✖',
  open: '○',
};

// Type icons with proper type safety
export const TYPE_ICONS: Record<IssueType, string> = {
  bug: '🐛',
  feature: '💡',
  epic: '🚀',
  chore: '🔧',
  task: '📋',
};

// Default icons for unknown values
const DEFAULT_STATUS_ICON = '○';
const DEFAULT_TYPE_ICON = '📋';

/**
 * Get status icon with logging for unknown values.
 * Falls back to default icon but logs warning for debugging.
 */
export function getStatusIcon(status: string): string {
  if (status in STATUS_ICONS) {
    return STATUS_ICONS[status as IssueStatus];
  }
  console.warn(`[cli] Unknown status "${status}", using default icon`);
  return DEFAULT_STATUS_ICON;
}

/**
 * Get type icon with logging for unknown values.
 * Falls back to default icon but logs warning for debugging.
 */
export function getTypeIcon(type: string): string {
  if (type in TYPE_ICONS) {
    return TYPE_ICONS[type as IssueType];
  }
  console.warn(`[cli] Unknown issue_type "${type}", using default icon`);
  return DEFAULT_TYPE_ICON;
}

/**
 * Get status color for terminal display.
 * Logs warning for unknown status values.
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'closed':
      return 'green';
    case 'in_progress':
      return 'yellow';
    case 'blocked':
      return 'red';
    case 'open':
      return 'white';
    default:
      console.warn(`[cli] Unknown status "${status}" for color, using default`);
      return 'white';
  }
}
