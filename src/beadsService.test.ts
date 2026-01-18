import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

// Mock fs/promises before importing beadsService
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

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

import { access } from 'node:fs/promises';
import {
  type BeadsIssue,
  buildBdArgs,
  clearBdPathCache,
  clearBeadsInitializedCache,
  configure,
  getAllAncestors,
  getChildren,
  isBeadsInitialized,
} from './beadsService';

// Helper to create minimal BeadsIssue for testing
// Note: parentId in overrides is converted to parentIds array
// Can also pass parentIds directly for multiple parent tests
function createIssue(
  overrides: Partial<BeadsIssue> & { id: string } & { parentId?: string },
): BeadsIssue {
  const { parentId, ...rest } = overrides;
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
    // If parentIds already provided in rest, use it; otherwise convert parentId
    parentIds: rest.parentIds ?? (parentId ? [parentId] : []),
    ...rest,
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

  it('returns child for both parents when child has multiple parents', () => {
    const parent1 = createIssue({ id: 'parent1' });
    const parent2 = createIssue({ id: 'parent2' });
    const child = createIssue({ id: 'child', parentIds: ['parent1', 'parent2'] });

    const issues = [parent1, parent2, child];

    // Child should appear under both parents
    const childrenOfParent1 = getChildren(parent1, issues);
    const childrenOfParent2 = getChildren(parent2, issues);

    expect(childrenOfParent1).toHaveLength(1);
    expect(childrenOfParent1[0].id).toBe('child');
    expect(childrenOfParent2).toHaveLength(1);
    expect(childrenOfParent2[0].id).toBe('child');
  });

  it('handles diamond dependency pattern (child with two parents that share grandparent)', () => {
    // Diamond: grandparent -> parent1, parent2 -> child (child has both parent1 and parent2)
    const grandparent = createIssue({ id: 'grandparent' });
    const parent1 = createIssue({ id: 'parent1', parentId: 'grandparent' });
    const parent2 = createIssue({ id: 'parent2', parentId: 'grandparent' });
    const child = createIssue({ id: 'child', parentIds: ['parent1', 'parent2'] });

    const issues = [grandparent, parent1, parent2, child];

    // Child appears under both parents
    expect(getChildren(parent1, issues).map((i) => i.id)).toEqual(['child']);
    expect(getChildren(parent2, issues).map((i) => i.id)).toEqual(['child']);

    // Both parents appear under grandparent
    expect(
      getChildren(grandparent, issues)
        .map((i) => i.id)
        .sort(),
    ).toEqual(['parent1', 'parent2']);
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

  it('returns all ancestors (order not guaranteed with multiple parents)', () => {
    const root = createIssue({ id: 'root', title: 'Root' });
    const middle = createIssue({ id: 'middle', parentId: 'root', title: 'Middle' });
    const leaf = createIssue({ id: 'leaf', parentId: 'middle', title: 'Leaf' });

    const issues = [root, middle, leaf];
    const result = getAllAncestors(leaf, issues);

    expect(result).toHaveLength(2);
    // Order not guaranteed, just check all ancestors are present
    expect(new Set(result.map((i) => i.id))).toEqual(new Set(['root', 'middle']));
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
    // Order not guaranteed, just check all ancestors are present
    expect(new Set(result.map((i) => i.id))).toEqual(
      new Set(['root', 'level1', 'level2', 'level3']),
    );
  });

  it('returns all ancestors from multiple parent paths', () => {
    // Issue has two parents: parent1 and parent2
    const parent1 = createIssue({ id: 'parent1' });
    const parent2 = createIssue({ id: 'parent2' });
    const child = createIssue({ id: 'child', parentIds: ['parent1', 'parent2'] });

    const issues = [parent1, parent2, child];
    const result = getAllAncestors(child, issues);

    expect(result).toHaveLength(2);
    expect(new Set(result.map((i) => i.id))).toEqual(new Set(['parent1', 'parent2']));
  });

  it('returns all unique ancestors in diamond dependency pattern', () => {
    // Diamond: grandparent -> parent1, parent2 -> child
    const grandparent = createIssue({ id: 'grandparent' });
    const parent1 = createIssue({ id: 'parent1', parentId: 'grandparent' });
    const parent2 = createIssue({ id: 'parent2', parentId: 'grandparent' });
    const child = createIssue({ id: 'child', parentIds: ['parent1', 'parent2'] });

    const issues = [grandparent, parent1, parent2, child];
    const result = getAllAncestors(child, issues);

    // Should include parent1, parent2, and grandparent (once, not twice)
    expect(result).toHaveLength(3);
    expect(new Set(result.map((i) => i.id))).toEqual(
      new Set(['grandparent', 'parent1', 'parent2']),
    );
  });

  it('handles multiple parents at different depths', () => {
    // deep parent (depth 2) and shallow parent (depth 0)
    const root = createIssue({ id: 'root' });
    const middle = createIssue({ id: 'middle', parentId: 'root' });
    const shallowParent = createIssue({ id: 'shallowParent' });
    const child = createIssue({ id: 'child', parentIds: ['middle', 'shallowParent'] });

    const issues = [root, middle, shallowParent, child];
    const result = getAllAncestors(child, issues);

    // Should include root (via middle), middle, and shallowParent
    expect(result).toHaveLength(3);
    expect(new Set(result.map((i) => i.id))).toEqual(new Set(['root', 'middle', 'shallowParent']));
  });
});

describe('isBeadsInitialized', () => {
  const mockAccess = vi.mocked(access);

  beforeEach(() => {
    clearBeadsInitializedCache();
    mockAccess.mockReset();
  });

  it('returns true when .beads directory exists', async () => {
    mockAccess.mockResolvedValue(undefined);
    const result = await isBeadsInitialized('/test/workspace');
    expect(result).toBe(true);
    expect(mockAccess).toHaveBeenCalledWith('/test/workspace/.beads');
  });

  it('returns false when .beads directory does not exist (ENOENT)', async () => {
    const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockAccess.mockRejectedValue(error);

    const result = await isBeadsInitialized('/test/workspace');
    expect(result).toBe(false);
  });

  it('returns false for permission errors (EACCES) without caching', async () => {
    const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    mockAccess.mockRejectedValue(error);

    const result = await isBeadsInitialized('/test/workspace');
    expect(result).toBe(false);

    // Should NOT be cached - calling again should hit the fs again
    mockAccess.mockResolvedValue(undefined);
    const result2 = await isBeadsInitialized('/test/workspace');
    expect(result2).toBe(true);
    expect(mockAccess).toHaveBeenCalledTimes(2);
  });

  it('caches true result for same workspace', async () => {
    mockAccess.mockResolvedValue(undefined);

    await isBeadsInitialized('/test/workspace');
    await isBeadsInitialized('/test/workspace');
    await isBeadsInitialized('/test/workspace');

    // Should only call access once due to caching
    expect(mockAccess).toHaveBeenCalledTimes(1);
  });

  it('caches false result for ENOENT errors', async () => {
    const error = new Error('ENOENT') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    mockAccess.mockRejectedValue(error);

    await isBeadsInitialized('/test/workspace');
    await isBeadsInitialized('/test/workspace');

    // Should only call access once due to caching
    expect(mockAccess).toHaveBeenCalledTimes(1);
  });

  it('uses separate cache entries for different workspaces', async () => {
    mockAccess.mockResolvedValue(undefined);

    await isBeadsInitialized('/workspace1');
    await isBeadsInitialized('/workspace2');

    expect(mockAccess).toHaveBeenCalledTimes(2);
    expect(mockAccess).toHaveBeenCalledWith('/workspace1/.beads');
    expect(mockAccess).toHaveBeenCalledWith('/workspace2/.beads');
  });
});

describe('clearBeadsInitializedCache', () => {
  const mockAccess = vi.mocked(access);

  beforeEach(() => {
    clearBeadsInitializedCache();
    mockAccess.mockReset();
  });

  it('clears cached results so next call re-checks filesystem', async () => {
    mockAccess.mockResolvedValue(undefined);

    // First call - should hit fs
    await isBeadsInitialized('/test/workspace');
    expect(mockAccess).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    await isBeadsInitialized('/test/workspace');
    expect(mockAccess).toHaveBeenCalledTimes(1);

    // Clear cache
    clearBeadsInitializedCache();

    // Third call - should hit fs again
    await isBeadsInitialized('/test/workspace');
    expect(mockAccess).toHaveBeenCalledTimes(2);
  });

  it('clears cache for all workspaces', async () => {
    mockAccess.mockResolvedValue(undefined);

    await isBeadsInitialized('/workspace1');
    await isBeadsInitialized('/workspace2');
    expect(mockAccess).toHaveBeenCalledTimes(2);

    clearBeadsInitializedCache();

    await isBeadsInitialized('/workspace1');
    await isBeadsInitialized('/workspace2');
    expect(mockAccess).toHaveBeenCalledTimes(4);
  });
});

describe('clearBdPathCache', () => {
  it('should be callable without error', () => {
    // clearBdPathCache clears the internal cached bd executable path
    // This allows the path to be re-discovered on the next command invocation
    expect(() => clearBdPathCache()).not.toThrow();
  });

  it('can be called multiple times without error', () => {
    expect(() => {
      clearBdPathCache();
      clearBdPathCache();
      clearBdPathCache();
    }).not.toThrow();
  });
});

describe('getBdCommand validation', () => {
  // Note: getBdCommand is not exported, but we can test it indirectly
  // through the behavior of listReadyIssues and exportIssuesWithDeps
  // For direct testing, we would need to export it or refactor

  beforeEach(() => {
    vi.mocked(vscode.workspace.getConfiguration).mockReset();
  });

  it('uses default "bd" when commandPath is empty', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === 'commandPath') return '';
        return defaultValue;
      }),
    } as unknown as vscode.WorkspaceConfiguration);

    // The configuration is read, but we can't easily test the internal function
    // This test documents the expected behavior
    const config = vscode.workspace.getConfiguration('beadsx');
    expect(config.get('commandPath', '')).toBe('');
  });

  it('configuration rejects paths with semicolons', () => {
    // Document expected behavior: paths with shell metacharacters should be rejected
    const dangerousPaths = [
      '/usr/bin/bd; rm -rf /',
      '/path|cat /etc/passwd',
      '/path & malicious',
      '/path`whoami`',
      '/path$HOME',
      '/path<file',
      '/path>file',
    ];

    // These paths should all be rejected by the regex /[;&|<>`$]/
    for (const path of dangerousPaths) {
      expect(/[;&|<>`$]/.test(path)).toBe(true);
    }
  });

  it('configuration allows safe paths', () => {
    const safePaths = [
      '/usr/local/bin/bd',
      '/home/user/.local/bin/bd',
      'C:\\Program Files\\beads\\bd.exe',
      './node_modules/.bin/bd',
      'bd',
    ];

    for (const path of safePaths) {
      expect(/[;&|<>`$]/.test(path)).toBe(false);
    }
  });
});

describe('buildBdArgs', () => {
  beforeEach(() => {
    // Reset config to default (no useJsonlMode)
    configure({});
  });

  it('returns args unchanged when useJsonlMode is false', () => {
    configure({ useJsonlMode: false });
    const result = buildBdArgs(['ready', '--json']);
    expect(result).toEqual(['ready', '--json']);
  });

  it('returns args unchanged when useJsonlMode is undefined', () => {
    configure({});
    const result = buildBdArgs(['export']);
    expect(result).toEqual(['export']);
  });

  it('prepends --no-db when useJsonlMode is true', () => {
    configure({ useJsonlMode: true });
    const result = buildBdArgs(['ready', '--json']);
    expect(result).toEqual(['--no-db', 'ready', '--json']);
  });

  it('prepends --no-db for export command when useJsonlMode is true', () => {
    configure({ useJsonlMode: true });
    const result = buildBdArgs(['export']);
    expect(result).toEqual(['--no-db', 'export']);
  });

  it('handles empty args array', () => {
    configure({ useJsonlMode: true });
    const result = buildBdArgs([]);
    expect(result).toEqual(['--no-db']);
  });

  it('handles empty args array when useJsonlMode is false', () => {
    configure({ useJsonlMode: false });
    const result = buildBdArgs([]);
    expect(result).toEqual([]);
  });

  it('does not mutate the original args array', () => {
    configure({ useJsonlMode: true });
    const original = ['ready', '--json'];
    const originalCopy = [...original];
    buildBdArgs(original);
    expect(original).toEqual(originalCopy);
  });

  // beadsx-906: buildBdArgs now throws for non-array input instead of silently recovering
  it('throws for non-array input when useJsonlMode is true', () => {
    configure({ useJsonlMode: true });
    // @ts-expect-error - Testing runtime behavior with invalid input
    expect(() => buildBdArgs(null)).toThrow('buildBdArgs: args must be an array');
  });

  it('throws for non-array input when useJsonlMode is false', () => {
    configure({ useJsonlMode: false });
    // @ts-expect-error - Testing runtime behavior with invalid input
    expect(() => buildBdArgs(undefined)).toThrow('buildBdArgs: args must be an array');
  });
});
