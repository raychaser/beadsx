import * as vscode from 'vscode';

import { type FilterMode, setOutputChannel, BeadsIssue } from './beadsService';
import { BeadsTreeDataProvider } from './beadsTreeDataProvider';

// Track last click for double-click detection
let lastClickedItem = { id: '', timestamp: 0 };
const DOUBLE_CLICK_THRESHOLD = 300; // milliseconds

function getDetailHtml(issue: BeadsIssue): string {
  const escapeHtml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(issue.id)}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      line-height: 1.6;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    .issue-header {
      border-bottom: 1px solid var(--vscode-panel-border);
      margin-bottom: 20px;
      padding-bottom: 15px;
    }
    .issue-id {
      font-weight: bold;
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }
    .issue-title {
      font-size: 20px;
      margin: 0;
      color: var(--vscode-foreground);
    }
    .metadata {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px 16px;
      margin: 15px 0;
    }
    .metadata-label {
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
    }
    .metadata-value {
      color: var(--vscode-foreground);
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-open {
      background-color: var(--vscode-charts-green);
      color: var(--vscode-editor-background);
    }
    .status-in_progress {
      background-color: var(--vscode-charts-blue);
      color: var(--vscode-editor-background);
    }
    .status-blocked {
      background-color: var(--vscode-charts-red);
      color: var(--vscode-editor-background);
    }
    .status-closed {
      background-color: var(--vscode-descriptionForeground);
      color: var(--vscode-editor-background);
    }
    .type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 12px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .section {
      margin-top: 20px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    .section-content {
      padding: 12px;
      background-color: var(--vscode-input-background);
      border-radius: 4px;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }
    .labels {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .label {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
  </style>
</head>
<body>
  <div class="issue-header">
    <div class="issue-id">${escapeHtml(issue.id)}</div>
    <h1 class="issue-title">${escapeHtml(issue.title)}</h1>
  </div>

  <div class="metadata">
    <div class="metadata-label">Type</div>
    <div class="metadata-value"><span class="type-badge">${escapeHtml(issue.issue_type)}</span></div>

    <div class="metadata-label">Status</div>
    <div class="metadata-value"><span class="status-badge status-${issue.status}">${escapeHtml(issue.status.replace('_', ' '))}</span></div>

    <div class="metadata-label">Priority</div>
    <div class="metadata-value">${issue.priority}</div>

    <div class="metadata-label">Assignee</div>
    <div class="metadata-value">${issue.assignee ? escapeHtml(issue.assignee) : '<em>Unassigned</em>'}</div>

    <div class="metadata-label">Created</div>
    <div class="metadata-value">${formatDate(issue.created_at)}</div>

    <div class="metadata-label">Updated</div>
    <div class="metadata-value">${formatDate(issue.updated_at)}</div>

    ${issue.closed_at ? `
    <div class="metadata-label">Closed</div>
    <div class="metadata-value">${formatDate(issue.closed_at)}</div>
    ` : ''}

    ${issue.labels && issue.labels.length > 0 ? `
    <div class="metadata-label">Labels</div>
    <div class="metadata-value">
      <div class="labels">
        ${issue.labels.map(label => `<span class="label">${escapeHtml(label)}</span>`).join('')}
      </div>
    </div>
    ` : ''}
  </div>

  ${issue.description ? `
  <div class="section">
    <div class="section-title">Description</div>
    <div class="section-content">${escapeHtml(issue.description)}</div>
  </div>
  ` : ''}
</body>
</html>`;
}

// Create output channel for logging
const outputChannel = vscode.window.createOutputChannel('BeadsX Extension');

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

  // Show detail panel on double-click
  const showDetailCommand = vscode.commands.registerCommand('beadsx.showDetail', (issue: BeadsIssue) => {
    const now = Date.now();
    const isDoubleClick =
      issue.id === lastClickedItem.id &&
      (now - lastClickedItem.timestamp) < DOUBLE_CLICK_THRESHOLD;

    lastClickedItem = { id: issue.id, timestamp: now };

    if (isDoubleClick) {
      // Create webview panel
      const panel = vscode.window.createWebviewPanel(
        'beadsxDetail',
        `Issue: ${issue.id}`,
        vscode.ViewColumn.One,
        {
          enableScripts: false,
          retainContextWhenHidden: true
        }
      );

      panel.webview.html = getDetailHtml(issue);
      outputChannel.appendLine(`Opened detail panel for ${issue.id}`);
    }
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

  context.subscriptions.push(treeView, refreshCommand, showDetailCommand, filterCommand, configChangeListener, dataLoadListener, {
    dispose: () => beadsProvider.dispose()
  });
}

export function deactivate() {}
