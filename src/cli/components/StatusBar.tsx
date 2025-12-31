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
}

const DEFAULT_TERMINAL_WIDTH = 80;

export function StatusBar({ issues, scrollInfo }: StatusBarProps) {
  const { width: rawWidth } = useTerminalDimensions();
  const terminalWidth = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : DEFAULT_TERMINAL_WIDTH;

  const total = issues.length;
  const open = issues.filter((i) => i.status === 'open').length;
  const inProgress = issues.filter((i) => i.status === 'in_progress').length;
  const closed = issues.filter((i) => i.status === 'closed').length;

  // Build left side content
  const leftContent = ` ${total} issues (${open} open, ${inProgress} in progress, ${closed} closed)`;

  // Build right side content (scroll indicator if scrollable)
  let rightContent = 'q:quit r:refresh';
  if (scrollInfo && scrollInfo.total > scrollInfo.visible) {
    const startLine = scrollInfo.offset + 1;
    const endLine = Math.min(scrollInfo.offset + scrollInfo.visible, scrollInfo.total);
    rightContent = `[${startLine}-${endLine}/${scrollInfo.total}] ${rightContent}`;
  }

  // Calculate padding to push right content to right edge
  const paddingLen = Math.max(1, terminalWidth - leftContent.length - rightContent.length);
  const padding = ' '.repeat(paddingLen);

  return (
    <box>
      <text>
        <span fg="gray">{leftContent}{padding}{rightContent}</span>
      </text>
    </box>
  );
}
