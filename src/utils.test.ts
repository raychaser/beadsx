import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeadsIssue } from './core/types';
import {
  computeIssueDepths,
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

// Helper to create minimal BeadsIssue for testing
function createTestIssue(id: string, parentId?: string): BeadsIssue {
  return {
    id,
    title: `Issue ${id}`,
    description: '',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    created_at: '2025-01-15T12:00:00.000Z',
    updated_at: '2025-01-15T12:00:00.000Z',
    closed_at: null,
    assignee: null,
    labels: [],
    parentId,
  };
}

describe('computeIssueDepths', () => {
  it('returns empty map for empty array', () => {
    const result = computeIssueDepths([]);
    expect(result.size).toBe(0);
  });

  it('assigns depth 0 to root issues (no parent)', () => {
    const issues = [createTestIssue('A'), createTestIssue('B'), createTestIssue('C')];
    const result = computeIssueDepths(issues);
    expect(result.get('A')).toBe(0);
    expect(result.get('B')).toBe(0);
    expect(result.get('C')).toBe(0);
  });

  it('computes correct depth for simple parent-child hierarchy', () => {
    const issues = [
      createTestIssue('root'),
      createTestIssue('child', 'root'),
      createTestIssue('grandchild', 'child'),
    ];
    const result = computeIssueDepths(issues);
    expect(result.get('root')).toBe(0);
    expect(result.get('child')).toBe(1);
    expect(result.get('grandchild')).toBe(2);
  });

  it('handles multiple trees in the same issue list', () => {
    const issues = [
      createTestIssue('tree1-root'),
      createTestIssue('tree1-child', 'tree1-root'),
      createTestIssue('tree2-root'),
      createTestIssue('tree2-child', 'tree2-root'),
    ];
    const result = computeIssueDepths(issues);
    expect(result.get('tree1-root')).toBe(0);
    expect(result.get('tree1-child')).toBe(1);
    expect(result.get('tree2-root')).toBe(0);
    expect(result.get('tree2-child')).toBe(1);
  });

  it('treats issue with missing parent as root (depth 0)', () => {
    // child's parent 'orphan-parent' is not in the issue list
    const issues = [createTestIssue('child', 'orphan-parent')];
    const result = computeIssueDepths(issues);
    expect(result.get('child')).toBe(0);
  });

  // Critical circular reference tests
  describe('circular reference detection', () => {
    it('handles direct self-reference (A -> A) without infinite loop', () => {
      const selfRef = createTestIssue('A', 'A');
      const result = computeIssueDepths([selfRef]);
      // Should terminate - the recursive call detects cycle and returns 0,
      // so outer call returns 0 + 1 = 1
      expect(result.get('A')).toBe(1);
    });

    it('handles simple cycle (A -> B -> A) without infinite loop', () => {
      const issues = [createTestIssue('A', 'B'), createTestIssue('B', 'A')];
      const result = computeIssueDepths(issues);
      // Should terminate with valid depths
      expect(result.size).toBe(2);
      // A processed first: recurses A->B->A, cycle detected sets A=0 temporarily,
      // then B=0+1=1, then A=1+1=2 (overwrites). B retrieved from cache.
      expect(result.get('A')).toBe(2);
      expect(result.get('B')).toBe(1);
    });

    it('handles longer cycle (A -> B -> C -> A) without infinite loop', () => {
      // Note: parentId means "parent is", so A->C means A's parent is C
      // Chain: A's parent is C, B's parent is A, C's parent is B (forms cycle)
      const issues = [
        createTestIssue('A', 'C'),
        createTestIssue('B', 'A'),
        createTestIssue('C', 'B'),
      ];
      const result = computeIssueDepths(issues);
      // Should terminate with valid depths
      expect(result.size).toBe(3);
      // A processed first: A->C->B->A, cycle at A sets A=0, then B=1, C=2, A=3
      expect(result.get('A')).toBe(3);
      expect(result.get('B')).toBe(1);
      expect(result.get('C')).toBe(2);
    });

    it('handles cycle with a valid root attached', () => {
      // Normal hierarchy: root <- child (child's parent is root)
      // Separate cycle: cycleA <- cycleB <- cycleA (mutual parents)
      const issues = [
        createTestIssue('root'),
        createTestIssue('child', 'root'),
        createTestIssue('cycleA', 'cycleB'),
        createTestIssue('cycleB', 'cycleA'),
      ];
      const result = computeIssueDepths(issues);
      // Normal hierarchy gets correct depths
      expect(result.get('root')).toBe(0);
      expect(result.get('child')).toBe(1);
      // Cycle is processed after normal nodes, cycleA->cycleB->cycleA
      expect(result.get('cycleA')).toBe(2);
      expect(result.get('cycleB')).toBe(1);
    });
  });

  it('handles deep hierarchy (5 levels)', () => {
    const issues = [
      createTestIssue('L0'),
      createTestIssue('L1', 'L0'),
      createTestIssue('L2', 'L1'),
      createTestIssue('L3', 'L2'),
      createTestIssue('L4', 'L3'),
    ];
    const result = computeIssueDepths(issues);
    expect(result.get('L0')).toBe(0);
    expect(result.get('L1')).toBe(1);
    expect(result.get('L2')).toBe(2);
    expect(result.get('L3')).toBe(3);
    expect(result.get('L4')).toBe(4);
  });

  it('handles issues processed in any order', () => {
    // Deliberately put child before parent
    const issues = [
      createTestIssue('grandchild', 'child'),
      createTestIssue('child', 'root'),
      createTestIssue('root'),
    ];
    const result = computeIssueDepths(issues);
    expect(result.get('root')).toBe(0);
    expect(result.get('child')).toBe(1);
    expect(result.get('grandchild')).toBe(2);
  });
});

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

  it('returns "just now" for less than 2 seconds ago', () => {
    expect(formatTimeAgo('2025-01-15T11:59:59.000Z')).toBe('just now'); // 1s ago
    expect(formatTimeAgo('2025-01-15T11:59:59.500Z')).toBe('just now'); // 0.5s ago
  });

  it('returns seconds ago for 2-59 seconds', () => {
    expect(formatTimeAgo('2025-01-15T11:59:58.000Z')).toBe('2s ago');
    expect(formatTimeAgo('2025-01-15T11:59:55.000Z')).toBe('5s ago');
    expect(formatTimeAgo('2025-01-15T11:59:30.000Z')).toBe('30s ago');
    expect(formatTimeAgo('2025-01-15T11:59:01.000Z')).toBe('59s ago');
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
  // Helper to create a sortable issue with all required fields
  const makeIssue = (
    overrides: Partial<{
      status: string;
      priority: number;
      closed_at: string | null;
      updated_at: string;
      id: string;
    }>,
  ) => ({
    status: 'open',
    priority: 2,
    closed_at: null,
    updated_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('does not mutate the input array', () => {
    const original = [
      makeIssue({ status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' }),
      makeIssue({ status: 'open' }),
    ];
    const originalCopy = [...original];
    sortIssues(original);
    expect(original).toEqual(originalCopy);
  });

  it('places open issues before closed issues', () => {
    const issues = [
      makeIssue({ status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' }),
      makeIssue({ status: 'open' }),
      makeIssue({ status: 'in_progress' }),
    ];
    const sorted = sortIssues(issues);
    expect(sorted[0].status).toBe('open');
    expect(sorted[1].status).toBe('in_progress');
    expect(sorted[2].status).toBe('closed');
  });

  it('sorts closed issues by recency (most recent first)', () => {
    const issues = [
      makeIssue({ status: 'closed', closed_at: '2025-01-10T10:00:00.000Z' }), // oldest
      makeIssue({ status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' }), // newest
      makeIssue({ status: 'closed', closed_at: '2025-01-12T10:00:00.000Z' }), // middle
    ];
    const sorted = sortIssues(issues);
    expect(sorted[0].closed_at).toBe('2025-01-15T10:00:00.000Z');
    expect(sorted[1].closed_at).toBe('2025-01-12T10:00:00.000Z');
    expect(sorted[2].closed_at).toBe('2025-01-10T10:00:00.000Z');
  });

  it('treats null closed_at as oldest', () => {
    const issues = [
      makeIssue({ status: 'closed', closed_at: null }),
      makeIssue({ status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' }),
    ];
    const sorted = sortIssues(issues);
    expect(sorted[0].closed_at).toBe('2025-01-15T10:00:00.000Z');
    expect(sorted[1].closed_at).toBe(null);
  });

  it('treats invalid date as oldest', () => {
    const issues = [
      makeIssue({ status: 'closed', closed_at: 'invalid-date' }),
      makeIssue({ status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' }),
    ];
    const sorted = sortIssues(issues);
    expect(sorted[0].closed_at).toBe('2025-01-15T10:00:00.000Z');
    expect(sorted[1].closed_at).toBe('invalid-date');
  });

  it('sorts open issues by priority (lowest number first)', () => {
    const issues = [
      makeIssue({ status: 'open', priority: 3, id: 'low' }),
      makeIssue({ status: 'open', priority: 0, id: 'critical' }),
      makeIssue({ status: 'open', priority: 2, id: 'medium' }),
    ];
    const sorted = sortIssues(issues);
    expect(sorted.map((i) => i.id)).toEqual(['critical', 'medium', 'low']);
  });

  it('maintains relative order for open issues with same priority', () => {
    const issues = [
      makeIssue({ status: 'open', id: 'first' }),
      makeIssue({ status: 'open', id: 'second' }),
      makeIssue({ status: 'open', id: 'third' }),
    ];
    const sorted = sortIssues(issues);
    expect(sorted.map((i) => i.id)).toEqual(['first', 'second', 'third']);
  });

  it('sorts in_progress issues by priority alongside open issues', () => {
    const issues = [
      makeIssue({ status: 'in_progress', priority: 3, id: 'ip-low' }),
      makeIssue({ status: 'open', priority: 1, id: 'open-high' }),
      makeIssue({ status: 'in_progress', priority: 0, id: 'ip-critical' }),
    ];
    const sorted = sortIssues(issues);
    expect(sorted.map((i) => i.id)).toEqual(['ip-critical', 'open-high', 'ip-low']);
  });

  it('sorts open by priority and closed by recency in combined list', () => {
    const issues = [
      makeIssue({
        status: 'closed',
        priority: 0,
        closed_at: '2025-01-10T10:00:00.000Z',
        id: 'closed-old',
      }),
      makeIssue({ status: 'open', priority: 2, id: 'open-low' }),
      makeIssue({
        status: 'closed',
        priority: 0,
        closed_at: '2025-01-15T10:00:00.000Z',
        id: 'closed-new',
      }),
      makeIssue({ status: 'open', priority: 0, id: 'open-high' }),
    ];
    const sorted = sortIssues(issues);
    expect(sorted.map((i) => i.id)).toEqual([
      'open-high', // open, priority 0
      'open-low', // open, priority 2
      'closed-new', // closed, most recent
      'closed-old', // closed, oldest
    ]);
  });

  it('handles negative and large priority values', () => {
    const issues = [
      makeIssue({ status: 'open', priority: 100, id: 'very-low' }),
      makeIssue({ status: 'open', priority: -1, id: 'negative' }),
      makeIssue({ status: 'open', priority: 0, id: 'zero' }),
    ];
    const sorted = sortIssues(issues);
    expect(sorted.map((i) => i.id)).toEqual(['negative', 'zero', 'very-low']);
  });

  it('handles empty array', () => {
    const sorted = sortIssues([]);
    expect(sorted).toEqual([]);
  });

  it('handles single element array', () => {
    const issues = [makeIssue({ status: 'open' })];
    const sorted = sortIssues(issues);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].status).toBe('open');
  });

  // Tests for 'recent' sort mode
  describe('recent mode', () => {
    it('sorts all issues by updated_at (most recent first)', () => {
      const issues = [
        makeIssue({ id: 'old', updated_at: '2025-01-10T10:00:00.000Z' }),
        makeIssue({ id: 'newest', updated_at: '2025-01-15T10:00:00.000Z' }),
        makeIssue({ id: 'middle', updated_at: '2025-01-12T10:00:00.000Z' }),
      ];
      const sorted = sortIssues(issues, 'recent');
      expect(sorted.map((i) => i.id)).toEqual(['newest', 'middle', 'old']);
    });

    it('ignores status when sorting by updated_at', () => {
      const issues = [
        makeIssue({
          id: 'closed-recent',
          status: 'closed',
          updated_at: '2025-01-15T10:00:00.000Z',
        }),
        makeIssue({ id: 'open-old', status: 'open', updated_at: '2025-01-10T10:00:00.000Z' }),
        makeIssue({
          id: 'in_progress',
          status: 'in_progress',
          updated_at: '2025-01-12T10:00:00.000Z',
        }),
      ];
      const sorted = sortIssues(issues, 'recent');
      expect(sorted.map((i) => i.id)).toEqual(['closed-recent', 'in_progress', 'open-old']);
    });

    it('ignores priority when sorting by updated_at', () => {
      const issues = [
        makeIssue({
          id: 'low-priority-recent',
          priority: 4,
          updated_at: '2025-01-15T10:00:00.000Z',
        }),
        makeIssue({ id: 'critical-old', priority: 0, updated_at: '2025-01-10T10:00:00.000Z' }),
      ];
      const sorted = sortIssues(issues, 'recent');
      expect(sorted.map((i) => i.id)).toEqual(['low-priority-recent', 'critical-old']);
    });

    it('treats invalid updated_at as oldest', () => {
      const issues = [
        makeIssue({ id: 'invalid', updated_at: 'invalid-date' }),
        makeIssue({ id: 'valid', updated_at: '2025-01-15T10:00:00.000Z' }),
      ];
      const sorted = sortIssues(issues, 'recent');
      expect(sorted.map((i) => i.id)).toEqual(['valid', 'invalid']);
    });

    it('handles empty array', () => {
      const sorted = sortIssues([], 'recent');
      expect(sorted).toEqual([]);
    });

    it('does not mutate the input array', () => {
      const original = [
        makeIssue({ id: 'a', updated_at: '2025-01-15T10:00:00.000Z' }),
        makeIssue({ id: 'b', updated_at: '2025-01-10T10:00:00.000Z' }),
      ];
      const originalCopy = [...original];
      sortIssues(original, 'recent');
      expect(original).toEqual(originalCopy);
    });

    it('handles single element array', () => {
      const issues = [makeIssue({ id: 'only', updated_at: '2025-01-15T10:00:00.000Z' })];
      const sorted = sortIssues(issues, 'recent');
      expect(sorted).toHaveLength(1);
      expect(sorted[0].id).toBe('only');
    });

    it('maintains relative order for issues with same updated_at (stable sort)', () => {
      const sameTimestamp = '2025-01-15T10:00:00.000Z';
      const issues = [
        makeIssue({ id: 'first', updated_at: sameTimestamp }),
        makeIssue({ id: 'second', updated_at: sameTimestamp }),
        makeIssue({ id: 'third', updated_at: sameTimestamp }),
      ];
      const sorted = sortIssues(issues, 'recent');
      // Array.sort is stable in modern JS (ES2019+), so order should be preserved
      expect(sorted.map((i) => i.id)).toEqual(['first', 'second', 'third']);
    });
  });

  it('uses default mode when no mode parameter is provided', () => {
    const issues = [
      makeIssue({ status: 'closed', closed_at: '2025-01-15T10:00:00.000Z' }),
      makeIssue({ status: 'open' }),
    ];
    const sortedNoArg = sortIssues(issues);
    const sortedDefault = sortIssues(issues, 'default');
    expect(sortedNoArg).toEqual(sortedDefault);
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

describe('truncateTitle', () => {
  it('returns empty string for maxWidth <= 0', () => {
    expect(truncateTitle('Hello', 0)).toBe('');
    expect(truncateTitle('Hello', -1)).toBe('');
    expect(truncateTitle('Hello', -100)).toBe('');
  });

  it('returns title unchanged when it fits within maxWidth', () => {
    expect(truncateTitle('Hello', 5)).toBe('Hello');
    expect(truncateTitle('Hello', 10)).toBe('Hello');
    expect(truncateTitle('Hi', 100)).toBe('Hi');
  });

  it('returns title unchanged when exactly at maxWidth', () => {
    expect(truncateTitle('Hello', 5)).toBe('Hello');
    expect(truncateTitle('AB', 2)).toBe('AB');
  });

  it('returns only ellipsis when maxWidth is 1', () => {
    expect(truncateTitle('Hello World', 1)).toBe('\u2026');
    expect(truncateTitle('A', 1)).toBe('A'); // fits exactly
  });

  it('truncates with ellipsis when title exceeds maxWidth', () => {
    expect(truncateTitle('Hello World', 8)).toBe('Hello W\u2026');
    expect(truncateTitle('Hello World', 6)).toBe('Hello\u2026');
    expect(truncateTitle('Hello World', 2)).toBe('H\u2026');
  });

  it('handles empty string input', () => {
    expect(truncateTitle('', 10)).toBe('');
    expect(truncateTitle('', 0)).toBe('');
    expect(truncateTitle('', 1)).toBe('');
  });

  it('handles single character titles', () => {
    expect(truncateTitle('A', 1)).toBe('A');
    expect(truncateTitle('A', 2)).toBe('A');
    expect(truncateTitle('A', 0)).toBe('');
  });

  it('handles titles with Unicode characters', () => {
    // Note: truncateTitle uses string length (UTF-16 code units), not visual width
    // Emoji like 🚀 are 2 code units, so 'Hello 🚀 World' has length 14
    // These tests verify the current behavior, not necessarily "correct" visual truncation
    expect(truncateTitle('Hello 🚀 World', 10)).toBe('Hello 🚀 \u2026'); // 9 chars + ellipsis
    expect(truncateTitle('日本語', 2)).toBe('日\u2026');
  });

  it('preserves spaces in truncated output', () => {
    expect(truncateTitle('A B C D E', 5)).toBe('A B \u2026');
    expect(truncateTitle('Word Word', 6)).toBe('Word \u2026');
  });
});

describe('shouldAutoExpandInRecent', () => {
  // Helper to create test issue with specific priority and status
  function makeIssue(
    id: string,
    opts: {
      parentId?: string;
      status?: 'open' | 'in_progress' | 'blocked' | 'closed';
      priority?: number;
    },
  ): BeadsIssue {
    return {
      id,
      title: `Issue ${id}`,
      description: '',
      status: opts.status ?? 'open',
      priority: opts.priority ?? 2,
      issue_type: 'task',
      created_at: '2025-01-15T12:00:00.000Z',
      updated_at: '2025-01-15T12:00:00.000Z',
      closed_at: opts.status === 'closed' ? '2025-01-15T12:00:00.000Z' : null,
      assignee: null,
      labels: [],
      parentId: opts.parentId,
    };
  }

  it('exports RECENT_VIEW_PRIORITY_THRESHOLD as 4', () => {
    expect(RECENT_VIEW_PRIORITY_THRESHOLD).toBe(4);
  });

  it('returns false when issue has no children', () => {
    const parent = makeIssue('parent', {});
    const allIssues = [parent];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(false);
  });

  it('returns true when direct child is open with priority < 4 (P2)', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', priority: 2 });
    const allIssues = [parent, child];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('returns true when direct child is open with priority 0 (critical)', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', priority: 0 });
    const allIssues = [parent, child];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('returns true when direct child is open with priority 3', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', priority: 3 });
    const allIssues = [parent, child];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('returns false when direct child is open with priority 4 (backlog)', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', priority: 4 });
    const allIssues = [parent, child];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(false);
  });

  it('returns false when direct child is open with priority > 4', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', priority: 5 });
    const allIssues = [parent, child];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(false);
  });

  it('returns false when direct child is closed (regardless of priority)', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', status: 'closed', priority: 0 });
    const allIssues = [parent, child];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(false);
  });

  it('returns false when all children are closed', () => {
    const parent = makeIssue('parent', {});
    const child1 = makeIssue('child1', { parentId: 'parent', status: 'closed', priority: 1 });
    const child2 = makeIssue('child2', { parentId: 'parent', status: 'closed', priority: 2 });
    const allIssues = [parent, child1, child2];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(false);
  });

  it('returns true when grandchild is open with priority < 4 (child is closed)', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', status: 'closed', priority: 4 });
    const grandchild = makeIssue('grandchild', { parentId: 'child', priority: 1 });
    const allIssues = [parent, child, grandchild];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('returns false when grandchild is open with priority 4 (all backlog)', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', priority: 4 });
    const grandchild = makeIssue('grandchild', { parentId: 'child', priority: 4 });
    const allIssues = [parent, child, grandchild];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(false);
  });

  it('returns true when one sibling is P4 and another is P2', () => {
    const parent = makeIssue('parent', {});
    const child1 = makeIssue('child1', { parentId: 'parent', priority: 4 });
    const child2 = makeIssue('child2', { parentId: 'parent', priority: 2 });
    const allIssues = [parent, child1, child2];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('returns true when deep descendant has important priority', () => {
    // parent -> child (P4) -> grandchild (P4) -> great-grandchild (P0)
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', priority: 4 });
    const grandchild = makeIssue('grandchild', { parentId: 'child', priority: 4 });
    const greatGrandchild = makeIssue('great-grandchild', { parentId: 'grandchild', priority: 0 });
    const allIssues = [parent, child, grandchild, greatGrandchild];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('returns true when child is in_progress (regardless of priority)', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', status: 'in_progress', priority: 2 });
    const allIssues = [parent, child];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('returns true when child is in_progress with P4 priority', () => {
    // in_progress always qualifies, even with backlog priority
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', status: 'in_progress', priority: 4 });
    const allIssues = [parent, child];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('returns true when grandchild is in_progress with P4 priority', () => {
    // in_progress always qualifies, even deep in tree
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', priority: 4 });
    const grandchild = makeIssue('grandchild', {
      parentId: 'child',
      status: 'in_progress',
      priority: 4,
    });
    const allIssues = [parent, child, grandchild];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('handles blocked status as non-closed', () => {
    const parent = makeIssue('parent', {});
    const child = makeIssue('child', { parentId: 'parent', status: 'blocked', priority: 2 });
    const allIssues = [parent, child];
    expect(shouldAutoExpandInRecent(parent, allIssues)).toBe(true);
  });

  it('handles complex tree with mixed priorities and statuses', () => {
    // Tree structure:
    // root
    // ├── branch1 (closed)
    // │   └── leaf1 (open P4)
    // └── branch2 (open P4)
    //     └── leaf2 (open P1)
    const root = makeIssue('root', {});
    const branch1 = makeIssue('branch1', { parentId: 'root', status: 'closed' });
    const leaf1 = makeIssue('leaf1', { parentId: 'branch1', priority: 4 });
    const branch2 = makeIssue('branch2', { parentId: 'root', priority: 4 });
    const leaf2 = makeIssue('leaf2', { parentId: 'branch2', priority: 1 });
    const allIssues = [root, branch1, leaf1, branch2, leaf2];

    // Root should expand because branch2 -> leaf2 has P1
    expect(shouldAutoExpandInRecent(root, allIssues)).toBe(true);
    // Branch1 should NOT expand because leaf1 is P4
    expect(shouldAutoExpandInRecent(branch1, allIssues)).toBe(false);
    // Branch2 should expand because leaf2 is P1
    expect(shouldAutoExpandInRecent(branch2, allIssues)).toBe(true);
  });
});
