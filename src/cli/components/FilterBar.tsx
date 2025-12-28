// Filter bar component showing current filter and last refresh time

import type { FilterMode } from '../../core';
import { formatTimeAgo } from '../../core';

interface FilterBarProps {
  filter: FilterMode;
  lastRefresh: Date;
}

const FILTERS: { key: string; mode: FilterMode; label: string }[] = [
  { key: '1', mode: 'all', label: 'All' },
  { key: '2', mode: 'open', label: 'Open' },
  { key: '3', mode: 'ready', label: 'Ready' },
  { key: '4', mode: 'recent', label: 'Recent' },
];

export function FilterBar({ filter, lastRefresh }: FilterBarProps) {
  const refreshAgo = formatTimeAgo(lastRefresh.toISOString()) || 'just now';

  return (
    <box>
      <text>
        <span> Filter: </span>
        {FILTERS.map((f, i) => (
          <span key={f.mode}>
            {i > 0 && <span> </span>}
            {f.mode === filter ? (
              <span fg="cyan" bold>
                [{f.label}]
              </span>
            ) : (
              <span fg="gray">{f.label}</span>
            )}
          </span>
        ))}
        <span fg="gray"> ↻ {refreshAgo}</span>
      </text>
    </box>
  );
}
