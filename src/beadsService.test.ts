import { describe, expect, it, vi } from 'vitest';

// Mock vscode module before importing beadsService
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
    })),
  },
  window: {
    showWarningMessage: vi.fn(),
  },
}));

import { type BeadsIssue, getAllAncestors, getChildren } from './beadsService';

// Helper to create minimal BeadsIssue for testing
function createIssue(overrides: Partial<BeadsIssue> & { id: string }): BeadsIssue {
  return {
    title: `Issue ${overrides.id}`,
    description: '',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    created_at: '2025-01-15T12:00:00.000Z',
    updated_at: '2025-01-15T12:00:00.000Z',
    closed_at: null,
    assignee: null,
    labels: [],
    ...overrides,
  };
}

describe('getChildren', () => {
  it('returns empty array when no children exist', () => {
    const parent = createIssue({ id: 'parent' });
    const issues = [parent];
    const result = getChildren(parent, issues);
    expect(result).toEqual([]);
  });

  it('returns only direct children', () => {
    const parent = createIssue({ id: 'parent' });
    const child1 = createIssue({ id: 'child1', parentId: 'parent' });
    const child2 = createIssue({ id: 'child2', parentId: 'parent' });
    const grandchild = createIssue({ id: 'grandchild', parentId: 'child1' });
    const unrelated = createIssue({ id: 'unrelated' });

    const issues = [parent, child1, child2, grandchild, unrelated];
    const result = getChildren(parent, issues);

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['child1', 'child2']);
  });

  it('does not include the parent issue itself', () => {
    const parent = createIssue({ id: 'parent' });
    const child = createIssue({ id: 'child', parentId: 'parent' });

    const issues = [parent, child];
    const result = getChildren(parent, issues);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('child');
  });

  it('handles empty issues array', () => {
    const parent = createIssue({ id: 'parent' });
    const result = getChildren(parent, []);
    expect(result).toEqual([]);
  });

  it('returns children when parent is not in allIssues', () => {
    const parent = createIssue({ id: 'parent' });
    const child = createIssue({ id: 'child', parentId: 'parent' });

    // Parent not in array, only child
    const issues = [child];
    const result = getChildren(parent, issues);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('child');
  });
});

describe('getAllAncestors', () => {
  it('returns empty array when issue has no parent', () => {
    const root = createIssue({ id: 'root' });
    const issues = [root];
    const result = getAllAncestors(root, issues);
    expect(result).toEqual([]);
  });

  it('returns single ancestor for direct parent', () => {
    const parent = createIssue({ id: 'parent' });
    const child = createIssue({ id: 'child', parentId: 'parent' });

    const issues = [parent, child];
    const result = getAllAncestors(child, issues);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('parent');
  });

  it('returns multiple ancestors in root-first order', () => {
    const root = createIssue({ id: 'root', title: 'Root' });
    const middle = createIssue({ id: 'middle', parentId: 'root', title: 'Middle' });
    const leaf = createIssue({ id: 'leaf', parentId: 'middle', title: 'Leaf' });

    const issues = [root, middle, leaf];
    const result = getAllAncestors(leaf, issues);

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['root', 'middle']); // root first
  });

  it('handles circular dependencies without infinite loop', () => {
    // A -> B -> C -> A (circular)
    const a = createIssue({ id: 'A', parentId: 'C' });
    const b = createIssue({ id: 'B', parentId: 'A' });
    const c = createIssue({ id: 'C', parentId: 'B' });

    const issues = [a, b, c];
    const result = getAllAncestors(a, issues);

    // Should return some ancestors but terminate (not hang)
    expect(result.length).toBeLessThanOrEqual(3);
    // Should have visited each node at most once
    const ids = result.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('handles self-referential parent without infinite loop', () => {
    const selfRef = createIssue({ id: 'self', parentId: 'self' });
    const issues = [selfRef];
    const result = getAllAncestors(selfRef, issues);

    // Should not hang, return empty or at most the self-reference
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('stops at missing parent in chain', () => {
    const child = createIssue({ id: 'child', parentId: 'parent' });
    const parent = createIssue({ id: 'parent', parentId: 'grandparent' });
    // Note: 'grandparent' does not exist in the array

    const issues = [child, parent];
    const result = getAllAncestors(child, issues);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('parent');
  });

  it('handles empty issues array', () => {
    const orphan = createIssue({ id: 'orphan', parentId: 'missing' });
    const result = getAllAncestors(orphan, []);
    expect(result).toEqual([]);
  });

  it('excludes the issue itself from ancestors', () => {
    const parent = createIssue({ id: 'parent' });
    const child = createIssue({ id: 'child', parentId: 'parent' });

    const issues = [parent, child];
    const result = getAllAncestors(child, issues);

    expect(result.map((i) => i.id)).not.toContain('child');
  });

  it('handles deep ancestry chain', () => {
    // Create a chain: root -> level1 -> level2 -> level3 -> level4
    const root = createIssue({ id: 'root' });
    const level1 = createIssue({ id: 'level1', parentId: 'root' });
    const level2 = createIssue({ id: 'level2', parentId: 'level1' });
    const level3 = createIssue({ id: 'level3', parentId: 'level2' });
    const level4 = createIssue({ id: 'level4', parentId: 'level3' });

    const issues = [root, level1, level2, level3, level4];
    const result = getAllAncestors(level4, issues);

    expect(result).toHaveLength(4);
    expect(result.map((i) => i.id)).toEqual(['root', 'level1', 'level2', 'level3']);
  });
});
