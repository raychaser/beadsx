import * as vscode from 'vscode';

import { type FilterMode, setOutputChannel } from './beadsService';
import { BeadsTreeDataProvider } from './beadsTreeDataProvider';

// Create output channel for logging
const outputChannel = vscode.window.createOutputChannel('Beads Issue Tracker');

export function activate(context: vscode.ExtensionContext) {
  outputChannel.appendLine('Beads extension activating...');
  setOutputChannel(outputChannel);
  const beadsProvider = new BeadsTreeDataProvider(context, outputChannel);

  const treeView = vscode.window.createTreeView('beadsxIssues', {
    treeDataProvider: beadsProvider,
    showCollapseAll: true
  });

  // Set initial filter in title
  treeView.title = beadsProvider.getFilterDisplayName();

  // Auto-expand open issues after data is loaded
  const autoExpandIssues = async () => {
    // Longer delay to ensure tree is fully rendered
    await new Promise(resolve => setTimeout(resolve, 500));
    const expandable = beadsProvider.getExpandableIssues();
    outputChannel.appendLine(`Auto-expanding ${expandable.length} issues`);
    for (const issue of expandable) {
      try {
        outputChannel.appendLine(`Revealing ${issue.id}`);
        await treeView.reveal(issue, { expand: true, select: false, focus: false });
      } catch (e) {
        outputChannel.appendLine(`Failed to reveal ${issue.id}: ${e}`);
      }
    }
  };

  // Listen for data load completion to auto-expand
  const dataLoadListener = beadsProvider.onDidLoadData(() => {
    autoExpandIssues();
  });

  const refreshCommand = vscode.commands.registerCommand('beadsx.refresh', () => {
    beadsProvider.refresh();
  });

  const filterCommand = vscode.commands.registerCommand('beadsx.filter', async () => {
    const currentFilter = beadsProvider.getFilter();
    const options: { label: string; value: FilterMode; description?: string }[] = [
      {
        label: currentFilter === 'all' ? '$(check) All Issues' : 'All Issues',
        value: 'all',
        description: currentFilter === 'all' ? 'current' : undefined
      },
      {
        label: currentFilter === 'open' ? '$(check) Open Issues' : 'Open Issues',
        value: 'open',
        description: currentFilter === 'open' ? 'current' : undefined
      },
      {
        label: currentFilter === 'ready' ? '$(check) Ready Issues' : 'Ready Issues',
        value: 'ready',
        description: currentFilter === 'ready' ? 'current' : undefined
      }
    ];

    const filterNames: Record<FilterMode, string> = {
      'all': 'All Issues',
      'open': 'Open Issues',
      'ready': 'Ready Issues'
    };

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select filter',
      title: `Filter Issues (current: ${filterNames[currentFilter]})`
    });

    if (selected) {
      beadsProvider.setFilter(selected.value);
      treeView.title = beadsProvider.getFilterDisplayName();
    }
  });

  // Start auto-reload
  beadsProvider.startAutoReload();

  // Listen for configuration changes
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('beadsx.autoReloadInterval')) {
      beadsProvider.startAutoReload();
    }
  });

  context.subscriptions.push(treeView, refreshCommand, filterCommand, configChangeListener, dataLoadListener, {
    dispose: () => beadsProvider.dispose()
  });
}

export function deactivate() {}
