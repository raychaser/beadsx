// Status bar component showing issue counts and hotkeys

import type { BeadsIssue } from '../../core';

interface StatusBarProps {
  issues: BeadsIssue[];
}

export function StatusBar({ issues }: StatusBarProps) {
  const total = issues.length;
  const open = issues.filter((i) => i.status === 'open').length;
  const inProgress = issues.filter((i) => i.status === 'in_progress').length;
  const closed = issues.filter((i) => i.status === 'closed').length;

  return (
    <box>
      <text>
        <span fg="gray">
          {' '}
          {total} issues ({open} open, {inProgress} in progress, {closed} closed) q:quit r:refresh
        </span>
      </text>
    </box>
  );
}
