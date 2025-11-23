import * as vscode from 'vscode';
import { BeadsTreeDataProvider } from './beadsTreeDataProvider';
import { FilterMode } from './beadsService';

export function activate(context: vscode.ExtensionContext) {
  const beadsProvider = new BeadsTreeDataProvider(context);

  const treeView = vscode.window.createTreeView('beadsIssues', {
    treeDataProvider: beadsProvider,
    showCollapseAll: true
  });

  const refreshCommand = vscode.commands.registerCommand('beads.refresh', () => {
    beadsProvider.refresh();
  });

  const filterCommand = vscode.commands.registerCommand('beads.filter', async () => {
    const currentFilter = beadsProvider.getFilter();
    const options: { label: string; value: FilterMode; picked: boolean }[] = [
      { label: 'All Issues', value: 'all', picked: currentFilter === 'all' },
      { label: 'Open Issues', value: 'open', picked: currentFilter === 'open' },
      { label: 'Ready Issues', value: 'ready', picked: currentFilter === 'ready' }
    ];

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select filter',
      title: 'Filter Issues'
    });

    if (selected) {
      beadsProvider.setFilter(selected.value);
    }
  });

  // Start auto-reload
  beadsProvider.startAutoReload();

  // Listen for configuration changes
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('beads.autoReloadInterval')) {
      beadsProvider.startAutoReload();
    }
  });

  context.subscriptions.push(treeView, refreshCommand, filterCommand, configChangeListener, {
    dispose: () => beadsProvider.dispose()
  });
}

export function deactivate() {}
