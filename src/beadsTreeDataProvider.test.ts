import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

// Mock vscode module
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => {
        if (key === 'autoExpandOpen') return true;
        if (key === 'shortIds') return false;
        if (key === 'autoReloadInterval') return 10;
        return defaultValue;
      }),
    })),
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
  },
  window: {
    showWarningMessage: vi.fn(),
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  TreeItem: class {
    label: string;
    collapsibleState: number;
    id?: string;
    description?: string;
    tooltip?: string;
    iconPath?: unknown;
    command?: unknown;
    constructor(label: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState ?? 0;
    }
  },
  ThemeIcon: class {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
  },
  EventEmitter: class {
    private listeners: Array<(e: unknown) => void> = [];
    event = (listener: (e: unknown) => void) => {
      this.listeners.push(listener);
      return { dispose: () => {} };
    };
    fire(data?: unknown) {
      for (const listener of this.listeners) {
        listener(data);
      }
    }
    dispose() {
      this.listeners = [];
    }
  },
}));

// Mock beadsService
vi.mock('./beadsService', () => ({
  listFilteredIssuesWithConfig: vi.fn(),
}));

import type { BeadsIssue } from './beadsService';
import { listFilteredIssuesWithConfig } from './beadsService';
import { BeadsTreeDataProvider } from './beadsTreeDataProvider';

// Helper to create minimal BeadsIssue for testing
// Note: parentId in overrides is converted to parentIds array
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
    parentIds: parentId ? [parentId] : [],
    ...rest,
  };
}

describe('BeadsTreeDataProvider - User Expand State', () => {
  let provider: BeadsTreeDataProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new BeadsTreeDataProvider();
  });

  describe('trackUserCollapse and trackUserExpand', () => {
    it('tracks user collapse state', () => {
      provider.trackUserCollapse('issue-1');
      expect(provider.isUserCollapsed('issue-1')).toBe(true);
      expect(provider.isUserExpanded('issue-1')).toBe(false);
    });

    it('tracks user expand state', () => {
      provider.trackUserExpand('issue-1');
      expect(provider.isUserExpanded('issue-1')).toBe(true);
      expect(provider.isUserCollapsed('issue-1')).toBe(false);
    });

    it('collapse overrides previous expand state', () => {
      provider.trackUserExpand('issue-1');
      expect(provider.isUserExpanded('issue-1')).toBe(true);

      provider.trackUserCollapse('issue-1');
      expect(provider.isUserCollapsed('issue-1')).toBe(true);
      expect(provider.isUserExpanded('issue-1')).toBe(false);
    });

    it('expand overrides previous collapse state', () => {
      provider.trackUserCollapse('issue-1');
      expect(provider.isUserCollapsed('issue-1')).toBe(true);

      provider.trackUserExpand('issue-1');
      expect(provider.isUserExpanded('issue-1')).toBe(true);
      expect(provider.isUserCollapsed('issue-1')).toBe(false);
    });

    it('returns false for issues with no user state', () => {
      expect(provider.isUserCollapsed('unknown-issue')).toBe(false);
      expect(provider.isUserExpanded('unknown-issue')).toBe(false);
    });
  });

  describe('setFilter clears user state', () => {
    it('clears user expand/collapse state on filter change', () => {
      // Set up some user state
      provider.trackUserCollapse('issue-1');
      provider.trackUserExpand('issue-2');
      expect(provider.isUserCollapsed('issue-1')).toBe(true);
      expect(provider.isUserExpanded('issue-2')).toBe(true);

      // Change filter
      provider.setFilter('open');

      // User state should be cleared
      expect(provider.isUserCollapsed('issue-1')).toBe(false);
      expect(provider.isUserExpanded('issue-2')).toBe(false);
    });
  });

  describe('getTreeItem respects user state', () => {
    beforeEach(async () => {
      // Set up mock issues
      const mockIssues = [
        createIssue({ id: 'parent', status: 'open' }),
        createIssue({ id: 'child', parentId: 'parent', status: 'open' }),
      ];
      vi.mocked(listFilteredIssuesWithConfig).mockResolvedValue(mockIssues);

      // Load issues into cache
      await provider.getChildren();
    });

    it('respects user collapse state over auto-expand', () => {
      const parentIssue = createIssue({ id: 'parent', status: 'open' });

      // Without user state, open issues with children should be expanded
      let treeItem = provider.getTreeItem(parentIssue);
      expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);

      // Track user collapse
      provider.trackUserCollapse('parent');
      treeItem = provider.getTreeItem(parentIssue);
      expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    });

    it('respects user expand state over auto-collapse', () => {
      const closedParent = createIssue({ id: 'parent', status: 'closed' });

      // Closed issues should be collapsed by default
      let treeItem = provider.getTreeItem(closedParent);
      expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);

      // Track user expand
      provider.trackUserExpand('parent');
      treeItem = provider.getTreeItem(closedParent);
      expect(treeItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
    });

    it('sets treeItem.id for VS Code state tracking', () => {
      const issue = createIssue({ id: 'test-issue' });
      const treeItem = provider.getTreeItem(issue);
      expect(treeItem.id).toBe('test-issue');
    });
  });
});
