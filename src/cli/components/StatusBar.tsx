// Status bar component showing issue counts and hotkeys

import { useTerminalDimensions } from '@opentui/react';
import type { BeadsIssue } from '../../core';

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

  // Build cwd line if provided
  const cwdLine = workspaceRoot ? ` ${workspaceRoot}` : '';

  return (
    <box flexDirection="column">
      <text>
        <span fg="gray">{summaryContent}{summaryPadding}{rightContent}</span>
      </text>
      {cwdLine && (
        <text>
          <span fg="gray">{cwdLine}</span>
        </text>
      )}
    </box>
  );
}
