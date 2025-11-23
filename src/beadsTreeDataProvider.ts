import * as vscode from 'vscode';
import { listFilteredIssues, BeadsIssue, FilterMode } from './beadsService';

export { BeadsIssue };

export class BeadsTreeDataProvider implements vscode.TreeDataProvider<BeadsIssue> {
  private _onDidChangeTreeData: vscode.EventEmitter<BeadsIssue | undefined | null | void> = new vscode.EventEmitter<BeadsIssue | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BeadsIssue | undefined | null | void> = this._onDidChangeTreeData.event;
  private workspaceRoot: string;
  private filterMode: FilterMode = 'all';
  private issuesCache: BeadsIssue[] = [];
  private context: vscode.ExtensionContext | undefined;
  private loadingPromise: Promise<BeadsIssue[]> | null = null;

  constructor(context?: vscode.ExtensionContext) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    this.context = context;

    // Restore saved filter mode
    if (context) {
      const savedFilter = context.workspaceState.get<FilterMode>('beads.filterMode');
      if (savedFilter) {
        this.filterMode = savedFilter;
      }
    }
  }

  refresh(): void {
    this.issuesCache = []; // Clear cache on refresh
    this._onDidChangeTreeData.fire();
  }

  setFilter(mode: FilterMode): void {
    this.filterMode = mode;
    // Save filter mode to workspace state
    if (this.context) {
      this.context.workspaceState.update('beads.filterMode', mode);
    }
    this.refresh();
  }

  getFilter(): FilterMode {
    return this.filterMode;
  }

  private hasChildren(issueId: string): boolean {
    return this.issuesCache.some(issue => issue.parentId === issueId);
  }

  getTreeItem(element: BeadsIssue): vscode.TreeItem {
    // Determine if this issue has children
    const hasChildIssues = this.hasChildren(element.id);
    // Start expanded if issue is open/in_progress, collapsed if closed
    const collapsibleState = hasChildIssues
      ? (element.status === 'closed'
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.Expanded)
      : vscode.TreeItemCollapsibleState.None;

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

    // Label shows status and ID, description shows title
    const treeItem = new vscode.TreeItem(`${statusSymbol} ${element.id}`, collapsibleState);

    treeItem.id = element.id;
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
        this.loadingPromise = listFilteredIssues(this.workspaceRoot, this.filterMode);
      }
      this.issuesCache = await this.loadingPromise;
      this.loadingPromise = null;
    }

    if (element) {
      // Return children of this element (issues whose parentId matches this element's id)
      return this.issuesCache.filter(issue => issue.parentId === element.id);
    }

    // Return root issues (issues with no parent)
    return this.issuesCache.filter(issue => !issue.parentId);
  }
}
