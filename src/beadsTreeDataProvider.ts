import * as vscode from 'vscode';
import { listIssues, BeadsIssue } from './beadsService';

export { BeadsIssue };

export class BeadsTreeDataProvider implements vscode.TreeDataProvider<BeadsIssue> {
  private _onDidChangeTreeData: vscode.EventEmitter<BeadsIssue | undefined | null | void> = new vscode.EventEmitter<BeadsIssue | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BeadsIssue | undefined | null | void> = this._onDidChangeTreeData.event;
  private workspaceRoot: string;

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BeadsIssue): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.title, vscode.TreeItemCollapsibleState.None);

    treeItem.id = element.id;
    treeItem.description = `${element.id} [${element.status}]`;
    treeItem.tooltip = `${element.title}\nType: ${element.issue_type}\nPriority: ${element.priority}\nStatus: ${element.status}`;

    // Set icon based on status
    if (element.status === 'in_progress') {
      treeItem.iconPath = new vscode.ThemeIcon('play-circle');
    } else if (element.status === 'closed') {
      treeItem.iconPath = new vscode.ThemeIcon('check');
    } else if (element.status === 'blocked') {
      treeItem.iconPath = new vscode.ThemeIcon('error');
    } else {
      treeItem.iconPath = new vscode.ThemeIcon('circle-outline');
    }

    return treeItem;
  }

  async getChildren(element?: BeadsIssue): Promise<BeadsIssue[]> {
    if (element) {
      return []; // No children for now
    }

    if (!this.workspaceRoot) {
      return [];
    }

    return listIssues(this.workspaceRoot);
  }
}
