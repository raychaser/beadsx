// Shared constants for CLI components

import type { IssueStatus, IssueType } from '../core';
import type { Theme } from './theme';

// Status indicators with proper type safety
export const STATUS_ICONS: Record<IssueStatus, string> = {
  closed: '✓',
  in_progress: '●',
  blocked: '✖',
  open: '○',
  tombstone: '🗑', // Soft-deleted issues - should be filtered out before display
};

// Type icons with proper type safety
export const TYPE_ICONS: Record<IssueType, string> = {
  bug: '🐛',
  feature: '💡',
  epic: '🚀',
  chore: '🔧',
  task: '📋',
};

// Distinct icons for unknown values - makes data issues visible to users
const UNKNOWN_STATUS_ICON = '?';
const UNKNOWN_TYPE_ICON = '❓';

/**
 * Get status icon with logging for unknown values.
 * Returns distinct '?' icon for unknown values to make data issues visible.
 */
export function getStatusIcon(status: string): string {
  if (status in STATUS_ICONS) {
    return STATUS_ICONS[status as IssueStatus];
  }
  console.warn(`[cli] Unknown status "${status}", using unknown icon`);
  return UNKNOWN_STATUS_ICON;
}

/**
 * Get type icon with logging for unknown values.
 * Returns distinct '❓' icon for unknown values to make data issues visible.
 */
export function getTypeIcon(type: string): string {
  if (type in TYPE_ICONS) {
    return TYPE_ICONS[type as IssueType];
  }
  console.warn(`[cli] Unknown issue_type "${type}", using unknown icon`);
  return UNKNOWN_TYPE_ICON;
}

/**
 * Extract short ID from a full issue ID.
 * Takes the last segment after the hyphen (e.g., "beadsx-123" -> "123").
 */
export function getShortId(id: string): string {
  if (!id) return '';
  return id.includes('-') ? (id.split('-').pop() ?? id) : id;
}

/**
 * Get status color for terminal display.
 * Uses theme-aware colors for dark/light mode support.
 */
export function getStatusColor(status: string, theme: Theme): string {
  switch (status) {
    case 'closed':
      return theme.statusClosed;
    case 'in_progress':
      return theme.statusInProgress;
    case 'blocked':
      return theme.statusBlocked;
    case 'open':
      return theme.statusOpen;
    case 'tombstone':
      return theme.textMuted; // Soft-deleted - should be filtered out before display
    default:
      console.warn(`[cli] Unknown status "${status}" for color, using unknown`);
      return theme.statusUnknown;
  }
}
