// Status bar component showing issue counts and hotkeys

import { useTerminalDimensions } from '@opentui/react';
import type { BeadsIssue } from '../../core';
import { useTheme } from '../theme';

interface ScrollInfo {
  offset: number;
  visible: number;
  total: number;
}

interface StatusBarProps {
  issues: BeadsIssue[];
  scrollInfo?: ScrollInfo;
  workspaceRoot?: string;
}

const DEFAULT_TERMINAL_WIDTH = 80;

export function StatusBar({ issues, scrollInfo, workspaceRoot }: StatusBarProps) {
  const theme = useTheme();
  const { width: rawWidth } = useTerminalDimensions();
  const terminalWidth = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : DEFAULT_TERMINAL_WIDTH;

  const total = issues.length;
  const open = issues.filter((i) => i.status === 'open').length;
  const inProgress = issues.filter((i) => i.status === 'in_progress').length;
  const closed = issues.filter((i) => i.status === 'closed').length;

  // Build summary line content
  const summaryContent = ` ${total} issues (${open} open, ${inProgress} in progress, ${closed} closed)`;

  // Build right side content (scroll indicator if scrollable)
  let rightContent = 'q:quit r:refresh';
  if (scrollInfo && scrollInfo.total > scrollInfo.visible) {
    const startLine = scrollInfo.offset + 1;
    const endLine = Math.min(scrollInfo.offset + scrollInfo.visible, scrollInfo.total);
    rightContent = `[${startLine}-${endLine}/${scrollInfo.total}] ${rightContent}`;
  }

  // Calculate padding to push right content to right edge
  const summaryPaddingLen = Math.max(1, terminalWidth - summaryContent.length - rightContent.length);
  const summaryPadding = ' '.repeat(summaryPaddingLen);

  // Build cwd line with theme indicator on right
  const cwdContent = workspaceRoot ? ` ${workspaceRoot}` : '';
  const themeIndicator = `[${theme.mode}]`;
  const cwdPaddingLen = Math.max(1, terminalWidth - cwdContent.length - themeIndicator.length);
  const cwdPadding = ' '.repeat(cwdPaddingLen);

  return (
    <box flexDirection="column">
      <text>
        <span fg={theme.textMuted}>{summaryContent}{summaryPadding}{rightContent}</span>
      </text>
      <text>
        <span fg={theme.textMuted}>{cwdContent}{cwdPadding}{themeIndicator}</span>
      </text>
    </box>
  );
}
