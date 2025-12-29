// Re-export utils from core for backwards compatibility

export type { SortableIssue } from './core/types';
export {
  computeIssueDepths,
  DEFAULT_RECENT_WINDOW_MINUTES,
  formatTimeAgo,
  MAX_RECENT_WINDOW_MINUTES,
  MIN_RECENT_WINDOW_MINUTES,
  sortIssues,
  validateRecentWindowMinutes,
} from './core/utils';
