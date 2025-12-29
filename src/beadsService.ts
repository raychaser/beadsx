// VS Code adapter for beads service
// Re-exports core functionality with VS Code-specific configuration

import * as vscode from 'vscode';
import {
  type BeadsConfig,
  type BeadsDependency,
  type BeadsIssue,
  clearBeadsInitializedCache,
  configure,
  type FilterMode,
  getAllAncestors,
  getChildren,
  isBeadsInitialized,
  listFilteredIssues,
  listReadyIssues,
} from './core';
import { DEFAULT_RECENT_WINDOW_MINUTES } from './core/utils';

// Re-export types and functions for backwards compatibility
export type { BeadsDependency, BeadsIssue, FilterMode };
export { clearBeadsInitializedCache, getAllAncestors, getChildren, isBeadsInitialized };

// Module-level output channel reference for logging
let outputChannel: vscode.OutputChannel | undefined;

export function setOutputChannel(channel: vscode.OutputChannel): void {
  outputChannel = channel;

  // Configure the core service with VS Code logger and config
  updateCoreConfig();
}

function updateCoreConfig(): void {
  const vsConfig = vscode.workspace.getConfiguration('beadsx');

  const config: BeadsConfig = {
    commandPath: vsConfig.get<string>('commandPath', ''),
    shortIds: vsConfig.get<boolean>('shortIds', false),
    autoExpandOpen: vsConfig.get<boolean>('autoExpandOpen', true),
    recentWindowMinutes: vsConfig.get<number>('recentWindowMinutes', DEFAULT_RECENT_WINDOW_MINUTES),
    useJsonlMode: vsConfig.get<boolean>('useJsonlMode', false),
  };

  const logger = {
    log: (msg: string) => {
      if (outputChannel) {
        const timestamp = new Date().toISOString();
        outputChannel.appendLine(`[${timestamp}] ${msg}`);
      }
    },
    warn: (msg: string) => {
      if (outputChannel) {
        const timestamp = new Date().toISOString();
        outputChannel.appendLine(`[${timestamp}] WARN: ${msg}`);
      }
    },
    error: (msg: string) => {
      if (outputChannel) {
        const timestamp = new Date().toISOString();
        outputChannel.appendLine(`[${timestamp}] ERROR: ${msg}`);
      }
    },
  };

  const notify = (message: string, type: 'info' | 'warn' | 'error') => {
    if (type === 'warn') {
      vscode.window.showWarningMessage(`BeadsX: ${message}`);
    } else if (type === 'error') {
      vscode.window.showErrorMessage(`BeadsX: ${message}`);
    }
  };

  configure(config, logger, notify);
}

// Wrapper to ensure config is refreshed before each call
// Returns BeadsIssue[] for backwards compatibility (unwraps BeadsResult)
export async function listFilteredIssuesWithConfig(
  workspaceRoot: string,
  filter: FilterMode,
): Promise<BeadsIssue[]> {
  updateCoreConfig();
  const result = await listFilteredIssues(workspaceRoot, filter);
  return result.data;
}

export async function listReadyIssuesWithConfig(workspaceRoot: string): Promise<BeadsIssue[]> {
  updateCoreConfig();
  const result = await listReadyIssues(workspaceRoot);
  return result.data;
}

// Export the core functions (now return BeadsResult)
export { listFilteredIssues, listReadyIssues };
