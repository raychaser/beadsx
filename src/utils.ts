// Re-export utils from core for backwards compatibility

export type { SortableIssue, SortMode } from './core/types';
export type { RootSortableIssue } from './core/utils';
export {
  computeIssueDepths,
  DEFAULT_RECENT_WINDOW_MINUTES,
  formatTimeAgo,
  MAX_RECENT_WINDOW_MINUTES,
  MIN_RECENT_WINDOW_MINUTES,
  shouldAutoExpandInRecent,
  sortChildrenForRecentView,
  sortIssues,
  sortRootIssuesForRecentView,
  truncateTitle,
  validateRecentWindowMinutes,
} from './core/utils';
