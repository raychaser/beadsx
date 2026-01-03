import * as vscode from 'vscode';
import { BeadsIssue, type FilterMode, listFilteredIssuesWithConfig } from './beadsService';
import {
  formatTimeAgo,
  type SortMode,
  shouldAutoExpandInRecent,
  sortChildrenForRecentView,
  sortIssues,
  sortRootIssuesForRecentView,
} from './utils';

export { BeadsIssue };

// Configuration cache interface
interface CachedConfig {
  autoExpandOpen: boolean;
  shortIds: boolean;
}

export class BeadsTreeDataProvider implements vscode.TreeDataProvider<BeadsIssue> {
  private _onDidChangeTreeData: vscode.EventEmitter<BeadsIssue | undefined | null | void> =
    new vscode.EventEmitter<BeadsIssue | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BeadsIssue | undefined | null | void> =
    this._onDidChangeTreeData.event;
  private _onDidLoadData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly onDidLoadData: vscode.Event<void> = this._onDidLoadData.event;
  private workspaceRoot: string;
  private filterMode: FilterMode = 'all';
  private issuesCache: BeadsIssue[] = [];
  private context: vscode.ExtensionContext | undefined;
  private loadingPromise: Promise<BeadsIssue[]> | null = null;
  private reloadInterval: NodeJS.Timeout | undefined;
  private outputChannel: vscode.OutputChannel | undefined;
  // Cached configuration to avoid repeated getConfiguration calls
  private cachedConfig: CachedConfig = { autoExpandOpen: true, shortIds: false };

  constructor(context?: vscode.ExtensionContext, outputChannel?: vscode.OutputChannel) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    this.context = context;
    this.outputChannel = outputChannel;

    // Log workspace root for debugging
    if (outputChannel) {
      outputChannel.appendLine(`Workspace root: ${this.workspaceRoot || '(none)'}`);
    }

    // Restore saved filter mode
    if (context) {
      const savedFilter = context.workspaceState.get<FilterMode>('beadsx.filterMode');
      if (savedFilter) {
        this.filterMode = savedFilter;
      }
    }

    // Initialize cached configuration
    this.refreshConfig();
  }

  // Refresh cached configuration from VS Code settings
  refreshConfig(): void {
    const config = vscode.workspace.getConfiguration('beadsx');
    this.cachedConfig = {
      autoExpandOpen: config.get<boolean>('autoExpandOpen', true),
      shortIds: config.get<boolean>('shortIds', false),
    };
  }

  private log(message: string): void {
    if (this.outputChannel) {
      const timestamp = new Date().toISOString();
      this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }
  }

  refresh(): void {
    this.log('refresh started');
    this.issuesCache = []; // Clear cache on refresh
    this._onDidChangeTreeData.fire();
  }

  setFilter(mode: FilterMode): void {
    this.filterMode = mode;
    // Save filter mode to workspace state
    if (this.context) {
      this.context.workspaceState.update('beadsx.filterMode', mode);
    }
    this.refresh();
  }

  getFilter(): FilterMode {
    return this.filterMode;
  }

  getCachedIssues(): BeadsIssue[] {
    return this.issuesCache;
  }

  getFilterDisplayName(): string {
    const names: Record<FilterMode, string> = {
      all: 'All Issues',
      open: 'Open Issues',
      ready: 'Ready Issues',
      recent: 'Recent Issues',
    };
    return names[this.filterMode];
  }

  // Get issues that should be auto-expanded based on current filter mode
  getExpandableIssues(): BeadsIssue[] {
    if (!this.cachedConfig.autoExpandOpen) {
      return [];
    }

    // Find issues that should be expanded based on filter mode
    return this.issuesCache.filter((issue) => {
      const isOpen = issue.status !== 'closed';
      const hasChildren = this.issuesCache.some((child) => child.parentId === issue.id);

      if (!hasChildren) return false;
      if (!isOpen) return false;

      if (this.filterMode === 'recent') {
        // Recent view: expand if issue is in_progress OR subtree contains important work
        return issue.status === 'in_progress' || shouldAutoExpandInRecent(issue, this.issuesCache);
      }

      // Other views: expand all non-closed issues
      return true;
    });
  }

  startAutoReload(): void {
    this.stopAutoReload();
    const config = vscode.workspace.getConfiguration('beadsx');
    const rawInterval = config.get<number>('autoReloadInterval', 10);
    // Clamp to reasonable bounds: 0 (disabled) or 1-3600 seconds (1 hour max)
    const intervalSeconds = rawInterval <= 0 ? 0 : Math.min(Math.max(rawInterval, 1), 3600);

    if (rawInterval !== intervalSeconds && rawInterval > 0) {
      this.log(`Warning: autoReloadInterval ${rawInterval}s clamped to ${intervalSeconds}s`);
    }

    this.log(`startAutoReload with interval: ${intervalSeconds}s`);

    if (intervalSeconds > 0) {
      this.reloadInterval = setInterval(() => {
        this.refresh();
      }, intervalSeconds * 1000);
    } else {
      this.log('Auto-reload disabled');
    }
  }

  stopAutoReload(): void {
    if (this.reloadInterval) {
      clearInterval(this.reloadInterval);
      this.reloadInterval = undefined;
    }
  }

  dispose(): void {
    this.stopAutoReload();
    this._onDidChangeTreeData.dispose();
    this._onDidLoadData.dispose();
  }

  private hasChildren(issueId: string): boolean {
    return this.issuesCache.some((issue) => issue.parentId === issueId);
  }

  // formatTimeAgo and sortIssues imported from './utils'

  getTreeItem(element: BeadsIssue): vscode.TreeItem {
    // Determine if this issue has children
    const hasChildIssues = this.hasChildren(element.id);

    // Use cached config for auto-expand setting
    const { autoExpandOpen, shortIds } = this.cachedConfig;

    // Determine collapsible state based on filter mode and issue status
    let collapsibleState = vscode.TreeItemCollapsibleState.None;
    if (hasChildIssues) {
      if (element.status === 'closed') {
        // Closed issues: always start collapsed
        collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      } else if (!autoExpandOpen) {
        // Auto-expand disabled: collapse all
        collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      } else if (this.filterMode === 'recent') {
        // Recent view: expand if issue is in_progress OR subtree contains important work
        const shouldExpand =
          element.status === 'in_progress' || shouldAutoExpandInRecent(element, this.issuesCache);
        collapsibleState = shouldExpand
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed;
      } else {
        // Other views: expand all non-closed issues
        collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      }
    }

    this.log(
      `getTreeItem ${element.id}: hasChildren=${hasChildIssues}, autoExpand=${autoExpandOpen}, state=${collapsibleState === vscode.TreeItemCollapsibleState.Expanded ? 'Expanded' : collapsibleState === vscode.TreeItemCollapsibleState.Collapsed ? 'Collapsed' : 'None'}`,
    );

    // Status symbol
    let statusSymbol: string;
    switch (element.status) {
      case 'closed':
        statusSymbol = '[C]';
        break;
      case 'in_progress':
        statusSymbol = '[>]';
        break;
      case 'blocked':
        statusSymbol = '[B]';
        break;
      default:
        statusSymbol = '[O]';
        break;
    }

    // Use cached shortIds setting
    let displayId = element.id;
    if (shortIds) {
      // Extract just the numeric/alphanumeric part after the last hyphen
      const lastHyphen = element.id.lastIndexOf('-');
      if (lastHyphen !== -1) {
        displayId = element.id.substring(lastHyphen + 1);
      }
    }

    // Label shows status, priority, and ID; description shows title
    const treeItem = new vscode.TreeItem(
      `${statusSymbol} p${element.priority} ${displayId}`,
      collapsibleState,
    );

    // Don't set treeItem.id to allow collapsible state to be re-evaluated on each refresh
    // Show relative time for closed issues
    if (element.status === 'closed' && element.closed_at) {
      const timeAgo = formatTimeAgo(element.closed_at);
      treeItem.description = timeAgo ? `${element.title} (${timeAgo})` : element.title;
    } else {
      treeItem.description = element.title;
    }
    treeItem.tooltip = `${element.title}\nType: ${element.issue_type}\nPriority: ${element.priority}\nStatus: ${element.status}`;

    // Determine icon based on issue type
    let iconName: string;
    switch (element.issue_type) {
      case 'bug':
        iconName = 'bug';
        break;
      case 'feature':
        iconName = 'lightbulb';
        break;
      case 'epic':
        iconName = 'rocket';
        break;
      case 'chore':
        iconName = 'tools';
        break;
      default:
        iconName = 'tasklist';
        break;
    }

    treeItem.iconPath = new vscode.ThemeIcon(iconName);

    // Add command for click handling
    treeItem.command = {
      command: 'beadsx.showDetail',
      title: 'Show Issue Detail',
      arguments: [element],
    };

    return treeItem;
  }

  async getChildren(element?: BeadsIssue): Promise<BeadsIssue[]> {
    if (!this.workspaceRoot) {
      return [];
    }

    // Load issues if cache is empty
    if (this.issuesCache.length === 0) {
      if (!this.loadingPromise) {
        const startTime = Date.now();
        this.loadingPromise = listFilteredIssuesWithConfig(this.workspaceRoot, this.filterMode)
          .then((issues) => {
            const elapsed = Date.now() - startTime;
            this.log(`loaded ${issues.length} issues in ${elapsed}ms`);
            this.issuesCache = issues;
            // Fire event after data is loaded
            this._onDidLoadData.fire();
            return issues;
          })
          .catch((error) => {
            this.log(`Error loading issues: ${error}`);
            vscode.window.showWarningMessage(
              `BeadsX: Failed to load issues. Check output channel for details.`,
            );
            return [];
          })
          .finally(() => {
            this.loadingPromise = null;
          });
      }
      await this.loadingPromise;
    }

    // Determine if we're in Recent view for special sorting
    const isRecentView = this.filterMode === 'recent';
    const sortMode: SortMode = isRecentView ? 'recent' : 'default';

    if (element) {
      // Return children of this element (issues whose parentId matches this element's id)
      const children = this.issuesCache.filter((issue) => issue.parentId === element.id);
      // For Recent view, sort children by non-closed first (by priority), then closed (by priority)
      return isRecentView ? sortChildrenForRecentView(children) : sortIssues(children, sortMode);
    }

    // Return root issues (issues with no parent OR whose parent is not in the filtered cache)
    const roots = this.issuesCache.filter((issue) => {
      if (!issue.parentId) return true;
      // If parent was filtered out, treat this issue as a root
      const parentInCache = this.issuesCache.some((i) => i.id === issue.parentId);
      return !parentInCache;
    });
    // For Recent view, sort roots with epics first (by update time), then non-epics (by status/priority)
    return isRecentView ? sortRootIssuesForRecentView(roots) : sortIssues(roots, sortMode);
  }

  getParent(element: BeadsIssue): BeadsIssue | undefined {
    if (!element.parentId) {
      return undefined;
    }
    return this.issuesCache.find((issue) => issue.id === element.parentId);
  }
}
