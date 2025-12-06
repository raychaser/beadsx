import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatTimeAgo,
  sortIssues,
  validateRecentWindowMinutes,
  MIN_RECENT_WINDOW_MINUTES,
  MAX_RECENT_WINDOW_MINUTES,
  DEFAULT_RECENT_WINDOW_MINUTES,
} from './utils';

describe('formatTimeAgo', () => {
  beforeEach(() => {
    // Mock Date.now() to return a fixed timestamp
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for invalid date', () => {
    expect(formatTimeAgo('not-a-date')).toBe('');
    expect(formatTimeAgo('')).toBe('');
  });

  it('returns empty string for future dates', () => {
    expect(formatTimeAgo('2025-01-15T13:00:00.000Z')).toBe('');
    expect(formatTimeAgo('2025-01-16T12:00:00.000Z')).toBe('');
  });

  it('returns "just now" for less than 1 minute ago', () => {
    expect(formatTimeAgo('2025-01-15T11:59:30.000Z')).toBe('just now');
    expect(formatTimeAgo('2025-01-15T11:59:59.000Z')).toBe('just now');
  });

  it('returns minutes ago for 1-59 minutes', () => {
    expect(formatTimeAgo('2025-01-15T11:59:00.000Z')).toBe('1m ago');
    expect(formatTimeAgo('2025-01-15T11:30:00.000Z')).toBe('30m ago');
    expect(formatTimeAgo('2025-01-15T11:01:00.000Z')).toBe('59m ago');
  });

  it('returns hours ago for 1-23 hours', () => {
    expect(formatTimeAgo('2025-01-15T11:00:00.000Z')).toBe('1h ago');
    expect(formatTimeAgo('2025-01-15T06:00:00.000Z')).toBe('6h ago');
    expect(formatTimeAgo('2025-01-14T13:00:00.000Z')).toBe('23h ago');
  });

  it('returns "yesterday" for 24-47 hours ago', () => {
    expect(formatTimeAgo('2025-01-14T12:00:00.000Z')).toBe('yesterday');
    expect(formatTimeAgo('2025-01-14T00:00:00.000Z')).toBe('yesterday');
  });

  it('returns days ago for 2+ days', () => {
    expect(formatTimeAgo('2025-01-13T12:00:00.000Z')).toBe('2d ago');
    expect(formatTimeAgo('2025-01-08T12:00:00.000Z')).toBe('7d ago');
    expect(formatTimeAgo('2025-01-01T12:00:00.000Z')).toBe('14d ago');
  });
});

describe('sortIssues', () => {
  it('does not mutate the input array', () => {
    const original = [
      { status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' },
      { status: 'open', closed_at: null },
    ];
    const originalCopy = [...original];
    sortIssues(original);
    expect(original).toEqual(originalCopy);
  });

  it('places open issues before closed issues', () => {
    const issues = [
      { status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' },
      { status: 'open', closed_at: null },
      { status: 'in_progress', closed_at: null },
    ];
    const sorted = sortIssues(issues);
    expect(sorted[0].status).toBe('open');
    expect(sorted[1].status).toBe('in_progress');
    expect(sorted[2].status).toBe('closed');
  });

  it('sorts closed issues by recency (most recent first)', () => {
    const issues = [
      { status: 'closed', closed_at: '2025-01-10T10:00:00.000Z' }, // oldest
      { status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' }, // newest
      { status: 'closed', closed_at: '2025-01-12T10:00:00.000Z' }, // middle
    ];
    const sorted = sortIssues(issues);
    expect(sorted[0].closed_at).toBe('2025-01-15T10:00:00.000Z');
    expect(sorted[1].closed_at).toBe('2025-01-12T10:00:00.000Z');
    expect(sorted[2].closed_at).toBe('2025-01-10T10:00:00.000Z');
  });

  it('treats null closed_at as oldest', () => {
    const issues = [
      { status: 'closed', closed_at: null },
      { status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' },
    ];
    const sorted = sortIssues(issues);
    expect(sorted[0].closed_at).toBe('2025-01-15T10:00:00.000Z');
    expect(sorted[1].closed_at).toBe(null);
  });

  it('treats invalid date as oldest', () => {
    const issues = [
      { status: 'closed', closed_at: 'invalid-date' },
      { status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' },
    ];
    const sorted = sortIssues(issues);
    expect(sorted[0].closed_at).toBe('2025-01-15T10:00:00.000Z');
    expect(sorted[1].closed_at).toBe('invalid-date');
  });

  it('maintains relative order of open issues', () => {
    const issues = [
      { status: 'open', closed_at: null, id: 'a' },
      { status: 'open', closed_at: null, id: 'b' },
      { status: 'open', closed_at: null, id: 'c' },
    ];
    const sorted = sortIssues(issues);
    // @ts-expect-error - id is for testing
    expect(sorted.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles empty array', () => {
    const sorted = sortIssues([]);
    expect(sorted).toEqual([]);
  });

  it('handles single element array', () => {
    const issues = [{ status: 'open', closed_at: null }];
    const sorted = sortIssues(issues);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].status).toBe('open');
  });
});

describe('validateRecentWindowMinutes', () => {
  it('returns default for non-number types', () => {
    expect(validateRecentWindowMinutes('string')).toEqual({
      value: DEFAULT_RECENT_WINDOW_MINUTES,
      warning: `Invalid recentWindowMinutes config, using default ${DEFAULT_RECENT_WINDOW_MINUTES} minutes`,
    });
    expect(validateRecentWindowMinutes(null)).toEqual({
      value: DEFAULT_RECENT_WINDOW_MINUTES,
      warning: `Invalid recentWindowMinutes config, using default ${DEFAULT_RECENT_WINDOW_MINUTES} minutes`,
    });
    expect(validateRecentWindowMinutes(undefined)).toEqual({
      value: DEFAULT_RECENT_WINDOW_MINUTES,
      warning: `Invalid recentWindowMinutes config, using default ${DEFAULT_RECENT_WINDOW_MINUTES} minutes`,
    });
  });

  it('returns default for NaN', () => {
    expect(validateRecentWindowMinutes(NaN)).toEqual({
      value: DEFAULT_RECENT_WINDOW_MINUTES,
      warning: `Invalid recentWindowMinutes config, using default ${DEFAULT_RECENT_WINDOW_MINUTES} minutes`,
    });
  });

  it('clamps values below minimum', () => {
    expect(validateRecentWindowMinutes(0)).toEqual({
      value: MIN_RECENT_WINDOW_MINUTES,
      warning: `recentWindowMinutes (0) below minimum, clamping to ${MIN_RECENT_WINDOW_MINUTES}`,
    });
    expect(validateRecentWindowMinutes(0.5)).toEqual({
      value: MIN_RECENT_WINDOW_MINUTES,
      warning: `recentWindowMinutes (0.5) below minimum, clamping to ${MIN_RECENT_WINDOW_MINUTES}`,
    });
    expect(validateRecentWindowMinutes(-1)).toEqual({
      value: MIN_RECENT_WINDOW_MINUTES,
      warning: `recentWindowMinutes (-1) below minimum, clamping to ${MIN_RECENT_WINDOW_MINUTES}`,
    });
  });

  it('clamps values above maximum', () => {
    expect(validateRecentWindowMinutes(20000)).toEqual({
      value: MAX_RECENT_WINDOW_MINUTES,
      warning: `recentWindowMinutes (20000) above maximum, clamping to ${MAX_RECENT_WINDOW_MINUTES}`,
    });
    expect(validateRecentWindowMinutes(100000)).toEqual({
      value: MAX_RECENT_WINDOW_MINUTES,
      warning: `recentWindowMinutes (100000) above maximum, clamping to ${MAX_RECENT_WINDOW_MINUTES}`,
    });
  });

  it('accepts valid values without warning', () => {
    expect(validateRecentWindowMinutes(1)).toEqual({ value: 1, warning: null });
    expect(validateRecentWindowMinutes(60)).toEqual({ value: 60, warning: null });
    expect(validateRecentWindowMinutes(1440)).toEqual({ value: 1440, warning: null }); // 1 day
    expect(validateRecentWindowMinutes(10080)).toEqual({ value: 10080, warning: null }); // 1 week
  });

  it('accepts boundary values', () => {
    expect(validateRecentWindowMinutes(MIN_RECENT_WINDOW_MINUTES)).toEqual({
      value: MIN_RECENT_WINDOW_MINUTES,
      warning: null,
    });
    expect(validateRecentWindowMinutes(MAX_RECENT_WINDOW_MINUTES)).toEqual({
      value: MAX_RECENT_WINDOW_MINUTES,
      warning: null,
    });
  });

  it('clamps Infinity to maximum', () => {
    expect(validateRecentWindowMinutes(Infinity)).toEqual({
      value: MAX_RECENT_WINDOW_MINUTES,
      warning: `recentWindowMinutes (Infinity) above maximum, clamping to ${MAX_RECENT_WINDOW_MINUTES}`,
    });
  });

  it('clamps -Infinity to minimum', () => {
    expect(validateRecentWindowMinutes(-Infinity)).toEqual({
      value: MIN_RECENT_WINDOW_MINUTES,
      warning: `recentWindowMinutes (-Infinity) below minimum, clamping to ${MIN_RECENT_WINDOW_MINUTES}`,
    });
  });
});
