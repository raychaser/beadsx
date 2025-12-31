// Filter bar component showing current filter and last refresh time

import { useTerminalDimensions } from '@opentui/react';
import { useEffect, useState } from 'react';
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

const DEFAULT_TERMINAL_WIDTH = 80;

export function FilterBar({ filter, lastRefresh }: FilterBarProps) {
  const { width: rawWidth } = useTerminalDimensions();
  // Use sensible fallback if terminal width is invalid (non-TTY, initialization)
  const terminalWidth = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : DEFAULT_TERMINAL_WIDTH;

  // Force re-render every second to update the time display
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // tick is used to force re-render - eslint-disable-line
  void tick;
  const refreshAgo = formatTimeAgo(lastRefresh.toISOString());

  // Calculate left side content width: " Filter: " + filter labels with brackets/spaces
  // " Filter: " = 9 chars
  // Each filter: label.length + spacing (1 space between, brackets add 2 for selected)
  const filterPartWidth =
    9 +
    FILTERS.reduce((acc, f, i) => {
      const labelLen = f.mode === filter ? f.label.length + 2 : f.label.length; // +2 for []
      const spacing = i > 0 ? 1 : 0;
      return acc + labelLen + spacing;
    }, 0);

  // Right side: "↻ {refreshAgo}" - ↻ renders as ~1 cell in most terminals
  const refreshPartWidth = 2 + refreshAgo.length; // "↻ " + refreshAgo

  // Calculate padding
  const paddingLen = Math.max(1, terminalWidth - filterPartWidth - refreshPartWidth);
  const padding = ' '.repeat(paddingLen);

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
        <span fg="gray">{padding}↻ {refreshAgo}</span>
      </text>
    </box>
  );
}
