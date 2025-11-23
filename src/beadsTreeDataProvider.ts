import * as vscode from 'vscode';
import { listFilteredIssues, BeadsIssue, FilterMode } from './beadsService';

export { BeadsIssue };

export class BeadsTreeDataProvider implements vscode.TreeDataProvider<BeadsIssue> {
  private _onDidChangeTreeData: vscode.EventEmitter<BeadsIssue | undefined | null | void> = new vscode.EventEmitter<BeadsIssue | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BeadsIssue | undefined | null | void> = this._onDidChangeTreeData.event;
  private _onDidLoadData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly onDidLoadData: vscode.Event<void> = this._onDidLoadData.event;
  private workspaceRoot: string;
  private filterMode: FilterMode = 'all';
  private issuesCache: BeadsIssue[] = [];
  private context: vscode.ExtensionContext | undefined;
  private loadingPromise: Promise<BeadsIssue[]> | null = null;
  private reloadInterval: NodeJS.Timeout | undefined;
  private outputChannel: vscode.OutputChannel | undefined;

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

  getFilterDisplayName(): string {
    const names: Record<FilterMode, string> = {
      'all': 'All Issues',
      'open': 'Open Issues',
      'ready': 'Ready Issues'
    };
    return names[this.filterMode];
  }

  // Get issues that should be auto-expanded (open/in_progress with children)
  getExpandableIssues(): BeadsIssue[] {
    const config = vscode.workspace.getConfiguration('beadsx');
    const autoExpand = config.get<boolean>('autoExpandOpen', true);

    if (!autoExpand) {
      return [];
    }

    // Find issues that are open/in_progress and have children
    return this.issuesCache.filter(issue => {
      const isOpen = issue.status !== 'closed';
      const hasChildren = this.issuesCache.some(child => child.parentId === issue.id);
      return isOpen && hasChildren;
    });
  }

  startAutoReload(): void {
    this.stopAutoReload();
    const config = vscode.workspace.getConfiguration('beadsx');
    const intervalSeconds = config.get<number>('autoReloadInterval', 10);

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
  }

  private hasChildren(issueId: string): boolean {
    return this.issuesCache.some(issue => issue.parentId === issueId);
  }

  getTreeItem(element: BeadsIssue): vscode.TreeItem {
    // Determine if this issue has children
    const hasChildIssues = this.hasChildren(element.id);

    // Check config for auto-expand setting
    const config = vscode.workspace.getConfiguration('beadsx');
    const autoExpand = config.get<boolean>('autoExpandOpen', true);

    // Start expanded if issue is open/in_progress and autoExpand is enabled, collapsed if closed
    let collapsibleState = vscode.TreeItemCollapsibleState.None;
    if (hasChildIssues) {
      if (element.status === 'closed') {
        collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      } else if (autoExpand) {
        collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      } else {
        collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      }
    }

    this.log(`getTreeItem ${element.id}: hasChildren=${hasChildIssues}, autoExpand=${autoExpand}, state=${collapsibleState === vscode.TreeItemCollapsibleState.Expanded ? 'Expanded' : collapsibleState === vscode.TreeItemCollapsibleState.Collapsed ? 'Collapsed' : 'None'}`);

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

    // Check if short IDs are enabled
    const shortIds = config.get<boolean>('shortIds', false);
    let displayId = element.id;
    if (shortIds) {
      // Extract just the numeric/alphanumeric part after the last hyphen
      const lastHyphen = element.id.lastIndexOf('-');
      if (lastHyphen !== -1) {
        displayId = element.id.substring(lastHyphen + 1);
      }
    }

    // Label shows status and ID, description shows title
    const treeItem = new vscode.TreeItem(`${statusSymbol} ${displayId}`, collapsibleState);

    // Don't set treeItem.id to allow collapsible state to be re-evaluated on each refresh
    treeItem.description = element.title;
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
        this.loadingPromise = listFilteredIssues(this.workspaceRoot, this.filterMode)
          .then(issues => {
            const elapsed = Date.now() - startTime;
            this.log(`loaded ${issues.length} issues in ${elapsed}ms`);
            this.issuesCache = issues;
            // Fire event after data is loaded
            this._onDidLoadData.fire();
            return issues;
          })
          .finally(() => { this.loadingPromise = null; });
      }
      await this.loadingPromise;
    }

    if (element) {
      // Return children of this element (issues whose parentId matches this element's id)
      return this.issuesCache.filter(issue => issue.parentId === element.id);
    }

    // Return root issues (issues with no parent)
    return this.issuesCache.filter(issue => !issue.parentId);
  }

  getParent(element: BeadsIssue): BeadsIssue | undefined {
    if (!element.parentId) {
      return undefined;
    }
    return this.issuesCache.find(issue => issue.id === element.parentId);
  }
}
