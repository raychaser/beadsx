import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

import {
  type BeadsIssue,
  clearBeadsInitializedCache,
  type FilterMode,
  getAllAncestors,
  getChildren,
  setOutputChannel,
} from './beadsService';
import { BeadsTreeDataProvider } from './beadsTreeDataProvider';

// Double-click detection threshold
const DOUBLE_CLICK_THRESHOLD = 300; // milliseconds

// HTML escaping utility (module-level to avoid recreation per call)
const escapeHtml = (str: string) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

// Date formatting for detail view (module-level to avoid recreation per call)
const formatDetailDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleString();
  } catch (error) {
    // Log for debugging - date formatting failures are not critical but worth tracking
    console.warn(`[BeadsX] Failed to format date "${dateStr}": ${error}`);
    return dateStr;
  }
};

// Generate a cryptographic nonce for CSP to enable inline styles/scripts without 'unsafe-inline'
function generateNonce(): string {
  try {
    return crypto.randomBytes(16).toString('base64');
  } catch (error) {
    // crypto.randomBytes can fail on entropy exhaustion or system issues (rare but possible)
    // Rethrow with context so callers can handle appropriately
    throw new Error(
      `Failed to generate secure nonce: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Generate error page HTML for webview failures
function getErrorHtml(issueId: string, errorMessage: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none';" />
</head>
<body style="font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background);">
  <h1>Error Loading Issue</h1>
  <p>Failed to render details for issue <strong>${escapeHtml(issueId)}</strong>.</p>
  <p style="color: var(--vscode-errorForeground);">Error: ${escapeHtml(errorMessage)}</p>
  <p>Please check the BeadsX output channel for more details.</p>
</body>
</html>`;
}

function getDetailHtml(issue: BeadsIssue, ancestors: BeadsIssue[], children: BeadsIssue[]): string {
  const nonce = generateNonce();
  // Build breadcrumbs HTML
  const breadcrumbsHtml =
    ancestors.length > 0
      ? `<nav class="breadcrumbs">
      ${ancestors.map((a) => `<span class="breadcrumb-item" data-id="${escapeHtml(a.id)}">${escapeHtml(a.title)}</span>`).join('<span class="breadcrumb-separator">›</span>')}
      <span class="breadcrumb-separator">›</span>
      <span class="breadcrumb-current">${escapeHtml(issue.title)}</span>
    </nav>`
      : '';

  // Build children HTML grouped by status
  const openChildren = children.filter((c) => c.status !== 'closed');
  const closedChildren = children.filter((c) => c.status === 'closed');

  const renderChildItem = (child: BeadsIssue) => `
    <li class="child-item" data-id="${escapeHtml(child.id)}">
      <span class="child-status child-status-${child.status}">${child.status === 'in_progress' ? 'IN PROG' : child.status.toUpperCase()}</span>
      <span class="child-title">${escapeHtml(child.title)}</span>
      <span class="child-id">${escapeHtml(child.id)}</span>
    </li>`;

  const childrenHtml =
    children.length > 0
      ? `<div class="children-section">
      <div class="section-title">Children (${children.length})</div>
      ${
        openChildren.length > 0
          ? `<div class="children-group">
        <div class="children-group-title">Open (${openChildren.length})</div>
        <ul class="children-list">${openChildren.map(renderChildItem).join('')}</ul>
      </div>`
          : ''
      }
      ${
        closedChildren.length > 0
          ? `<div class="children-group">
        <div class="children-group-title">Closed (${closedChildren.length})</div>
        <ul class="children-list">${closedChildren.map(renderChildItem).join('')}</ul>
      </div>`
          : ''
      }
    </div>`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <title>${escapeHtml(issue.id)}</title>
  <style nonce="${nonce}">
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      line-height: 1.6;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    .breadcrumbs {
      margin-bottom: 16px;
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
    }
    .breadcrumb-item {
      cursor: pointer;
      color: var(--vscode-textLink-foreground);
    }
    .breadcrumb-item:hover {
      text-decoration: underline;
    }
    .breadcrumb-separator {
      margin: 0 6px;
      color: var(--vscode-descriptionForeground);
    }
    .breadcrumb-current {
      color: var(--vscode-foreground);
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
    .children-section {
      margin-top: 20px;
    }
    .children-group {
      margin-bottom: 12px;
    }
    .children-group-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .children-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .child-item {
      padding: 6px 10px;
      margin: 2px 0;
      background-color: var(--vscode-input-background);
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .child-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .child-status {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 4px;
      border-radius: 2px;
    }
    .child-status-open {
      background-color: var(--vscode-charts-green);
      color: var(--vscode-editor-background);
    }
    .child-status-in_progress {
      background-color: var(--vscode-charts-blue);
      color: var(--vscode-editor-background);
    }
    .child-status-blocked {
      background-color: var(--vscode-charts-red);
      color: var(--vscode-editor-background);
    }
    .child-status-closed {
      background-color: var(--vscode-descriptionForeground);
      color: var(--vscode-editor-background);
    }
    .child-title {
      flex: 1;
      color: var(--vscode-textLink-foreground);
    }
    .child-id {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  ${breadcrumbsHtml}
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
    <div class="metadata-value">${formatDetailDate(issue.created_at)}</div>

    <div class="metadata-label">Updated</div>
    <div class="metadata-value">${formatDetailDate(issue.updated_at)}</div>

    ${
      issue.closed_at
        ? `
    <div class="metadata-label">Closed</div>
    <div class="metadata-value">${formatDetailDate(issue.closed_at)}</div>
    `
        : ''
    }

    ${
      issue.labels && issue.labels.length > 0
        ? `
    <div class="metadata-label">Labels</div>
    <div class="metadata-value">
      <div class="labels">
        ${issue.labels.map((label) => `<span class="label">${escapeHtml(label)}</span>`).join('')}
      </div>
    </div>
    `
        : ''
    }
  </div>

  ${
    issue.description
      ? `
  <div class="section">
    <div class="section-title">Description</div>
    <div class="section-content">${escapeHtml(issue.description)}</div>
  </div>
  `
      : ''
  }
  ${childrenHtml}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.breadcrumb-item').forEach(item => {
      item.addEventListener('click', () => {
        const issueId = item.getAttribute('data-id');
        vscode.postMessage({ command: 'navigateToIssue', issueId });
      });
    });
    document.querySelectorAll('.child-item').forEach(item => {
      item.addEventListener('click', () => {
        const issueId = item.getAttribute('data-id');
        vscode.postMessage({ command: 'navigateToIssue', issueId });
      });
    });
  </script>
</body>
</html>`;
}

export function activate(context: vscode.ExtensionContext) {
  // Create output channel for logging (inside activate for proper lifecycle)
  const outputChannel = vscode.window.createOutputChannel('BeadsX Extension');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('Beads extension activating...');
  setOutputChannel(outputChannel);
  const beadsProvider = new BeadsTreeDataProvider(context, outputChannel);

  // Track last click for double-click detection (scoped to activation)
  let lastClickedItem = { id: '', timestamp: 0 };

  const treeView = vscode.window.createTreeView('beadsxIssues', {
    treeDataProvider: beadsProvider,
    showCollapseAll: true,
  });

  // Set initial filter in title
  treeView.title = beadsProvider.getFilterDisplayName();

  // Auto-expand open issues after data is loaded
  const autoExpandIssues = async () => {
    // Longer delay to ensure tree is fully rendered
    await new Promise((resolve) => setTimeout(resolve, 500));
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
    clearBeadsInitializedCache(); // Re-check .beads/ directory on manual refresh
    beadsProvider.refresh();
  });

  // Show detail panel on double-click
  const showDetailCommand = vscode.commands.registerCommand(
    'beadsx.showDetail',
    (issue: BeadsIssue) => {
      const now = Date.now();
      const isDoubleClick =
        issue.id === lastClickedItem.id && now - lastClickedItem.timestamp < DOUBLE_CLICK_THRESHOLD;

      lastClickedItem = { id: issue.id, timestamp: now };

      if (isDoubleClick) {
        // Get cached issues for initial render
        const initialIssues = beadsProvider.getCachedIssues();
        const ancestors = getAllAncestors(issue, initialIssues);
        const children = getChildren(issue, initialIssues);

        // Create webview panel
        const panel = vscode.window.createWebviewPanel(
          'beadsxDetail',
          `Issue: ${issue.id}`,
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            // Note: retainContextWhenHidden removed - not needed for static content
          },
        );

        try {
          panel.webview.html = getDetailHtml(issue, ancestors, children);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          outputChannel.appendLine(
            `ERROR: Failed to render detail panel for ${issue.id}: ${errorMessage}`,
          );
          vscode.window.showErrorMessage(
            `Failed to render issue details. Check the BeadsX output channel for details.`,
          );
          panel.webview.html = getErrorHtml(issue.id, errorMessage);
        }

        // Handle breadcrumb and child navigation
        const messageDisposable = panel.webview.onDidReceiveMessage((message) => {
          if (message.command === 'navigateToIssue') {
            // Validate message payload
            if (typeof message.issueId !== 'string' || !message.issueId) {
              outputChannel.appendLine(
                `Invalid navigateToIssue message: ${JSON.stringify(message)}`,
              );
              return;
            }

            // Get fresh cache for navigation (fixes stale data issue)
            const currentIssues = beadsProvider.getCachedIssues();
            const targetIssue = currentIssues.find((i) => i.id === message.issueId);

            if (targetIssue) {
              // Update panel with new issue
              const newAncestors = getAllAncestors(targetIssue, currentIssues);
              const newChildren = getChildren(targetIssue, currentIssues);
              panel.title = `Issue: ${targetIssue.id}`;
              try {
                panel.webview.html = getDetailHtml(targetIssue, newAncestors, newChildren);
                outputChannel.appendLine(`Navigated to ${targetIssue.id}`);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(
                  `ERROR: Failed to navigate to ${targetIssue.id}: ${errorMessage}`,
                );
                vscode.window.showErrorMessage(
                  `Failed to load issue ${targetIssue.id}. Check the BeadsX output channel for details.`,
                );
                panel.webview.html = getErrorHtml(targetIssue.id, errorMessage);
              }
            } else {
              // User feedback for failed navigation
              outputChannel.appendLine(
                `Navigation failed: Issue ${message.issueId} not found in cache`,
              );
              vscode.window.showWarningMessage(
                `Issue ${message.issueId} not found. It may have been deleted or the view may need refreshing.`,
              );
            }
          } else {
            outputChannel.appendLine(`Unknown webview message command: ${JSON.stringify(message)}`);
          }
        });

        // Clean up message listener when panel is disposed (fixes memory leak)
        panel.onDidDispose(() => {
          messageDisposable.dispose();
        });

        outputChannel.appendLine(`Opened detail panel for ${issue.id}`);
      }
    },
  );

  const filterCommand = vscode.commands.registerCommand('beadsx.filter', async () => {
    const currentFilter = beadsProvider.getFilter();
    const options: { label: string; value: FilterMode; description?: string }[] = [
      {
        label: currentFilter === 'all' ? '$(check) All Issues' : 'All Issues',
        value: 'all',
        description: currentFilter === 'all' ? 'current' : undefined,
      },
      {
        label: currentFilter === 'open' ? '$(check) Open Issues' : 'Open Issues',
        value: 'open',
        description: currentFilter === 'open' ? 'current' : undefined,
      },
      {
        label: currentFilter === 'ready' ? '$(check) Ready Issues' : 'Ready Issues',
        value: 'ready',
        description: currentFilter === 'ready' ? 'current' : undefined,
      },
      {
        label: currentFilter === 'recent' ? '$(check) Recent Issues' : 'Recent Issues',
        value: 'recent',
        description: currentFilter === 'recent' ? 'current' : undefined,
      },
    ];

    const filterNames: Record<FilterMode, string> = {
      all: 'All Issues',
      open: 'Open Issues',
      ready: 'Ready Issues',
      recent: 'Recent Issues',
    };

    const selected = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select filter',
      title: `Filter Issues (current: ${filterNames[currentFilter]})`,
    });

    if (selected) {
      beadsProvider.setFilter(selected.value);
      treeView.title = beadsProvider.getFilterDisplayName();
    }
  });

  // Start auto-reload
  beadsProvider.startAutoReload();

  // Listen for configuration changes
  const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('beadsx.autoReloadInterval')) {
      beadsProvider.startAutoReload();
    }
    // Refresh cached config when any beadsx settings change
    if (e.affectsConfiguration('beadsx')) {
      beadsProvider.refreshConfig();
    }
    if (
      e.affectsConfiguration('beadsx.recentWindowMinutes') &&
      beadsProvider.getFilter() === 'recent'
    ) {
      beadsProvider.refresh();
    }
  });

  context.subscriptions.push(
    treeView,
    refreshCommand,
    showDetailCommand,
    filterCommand,
    configChangeListener,
    dataLoadListener,
    {
      dispose: () => beadsProvider.dispose(),
    },
  );
}

export function deactivate() {}
