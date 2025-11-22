import * as vscode from 'vscode';
import { BeadsTreeDataProvider } from './beadsTreeDataProvider';

export function activate(context: vscode.ExtensionContext) {
  const beadsProvider = new BeadsTreeDataProvider();

  const treeView = vscode.window.createTreeView('beadsIssues', {
    treeDataProvider: beadsProvider,
    showCollapseAll: true
  });

  const refreshCommand = vscode.commands.registerCommand('beads.refresh', () => {
    beadsProvider.refresh();
  });

  context.subscriptions.push(treeView, refreshCommand);
}

export function deactivate() {}
