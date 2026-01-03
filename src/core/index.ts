// Core exports - shared between VS Code extension and CLI

// beadsx-918: Export BeadsInitStatus type for consumers that need detailed init status
export type { BeadsInitStatus } from './beadsService';
export {
  buildBdArgs,
  clearBdPathCache,
  clearBeadsInitializedCache,
  configure,
  exportIssuesWithDeps,
  getAllAncestors,
  getBeadsInitStatus,
  getChildren,
  getConfig,
  getRootIssues,
  isBeadsInitialized,
  listFilteredIssues,
  listReadyIssues,
} from './beadsService';
export type {
  BeadsConfig,
  BeadsDependency,
  BeadsIssue,
  BeadsResult,
  FilterMode,
  IssueStatus,
  IssueType,
  Logger,
  SortableIssue,
  SortMode,
} from './types';

export {
  DEFAULT_RECENT_WINDOW_MINUTES,
  formatTimeAgo,
  MAX_RECENT_WINDOW_MINUTES,
  MIN_RECENT_WINDOW_MINUTES,
  RECENT_VIEW_PRIORITY_THRESHOLD,
  shouldAutoExpandInRecent,
  sortIssues,
  truncateTitle,
  validateRecentWindowMinutes,
} from './utils';
