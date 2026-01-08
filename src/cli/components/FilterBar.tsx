// Filter bar component showing current filter and last refresh time

import { useTerminalDimensions } from '@opentui/react';
import { useEffect, useState } from 'react';
import type { FilterMode } from '../../core';
import { formatTimeAgo } from '../../core';
import { useTheme } from '../theme';

interface FilterBarProps {
  filter: FilterMode;
  lastRefresh: Date;
}

const FILTERS: { mode: FilterMode; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'open', label: 'Open' },
  { mode: 'ready', label: 'Ready' },
  { mode: 'recent', label: 'Recent' },
];

const DEFAULT_TERMINAL_WIDTH = 80;

export function FilterBar({ filter, lastRefresh }: FilterBarProps) {
  const theme = useTheme();
  const { width: rawWidth } = useTerminalDimensions();
  // Use sensible fallback if terminal width is invalid (non-TTY, initialization)
  const terminalWidth = typeof rawWidth === 'number' && rawWidth > 0 ? rawWidth : DEFAULT_TERMINAL_WIDTH;

  // Force re-render every second to update the time display
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => (t + 1) % 60), 1000);
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
        <span fg={theme.textMuted}> Filter: </span>
        {FILTERS.map((f, i) => (
          <span key={f.mode}>
            {i > 0 && <span> </span>}
            {f.mode === filter ? (
              <span fg={theme.accent} bold>
                [{f.label}]
              </span>
            ) : (
              <span fg={theme.textMuted}>{f.label}</span>
            )}
          </span>
        ))}
        <span fg={theme.textMuted}>{padding}↻ {refreshAgo}</span>
      </text>
    </box>
  );
}
