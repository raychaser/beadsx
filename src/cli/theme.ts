// Theme system for terminal dark/light mode support

import { createContext, useContext } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  mode: ThemeMode;
  // Text colors
  textPrimary: string | undefined; // Main content (undefined = terminal default)
  textMuted: string; // De-emphasized text
  textInverse: string; // Text on highlighted backgrounds
  // UI chrome
  border: string; // Tree lines, separators
  // Interactive
  accent: string; // Active indicators, emphasis
  selectionBg: string; // Selected row background
  // Status colors
  statusOpen: string; // Open issues
  statusInProgress: string; // In-progress issues
  statusBlocked: string; // Blocked issues
  statusClosed: string; // Closed issues
  statusUnknown: string; // Unknown/error states
  // Feedback
  error: string; // Error messages
}

/**
 * Dark theme - designed for dark terminal backgrounds.
 * Uses terminal default for primary text to ensure native appearance.
 */
export const darkTheme: Theme = {
  mode: 'dark',
  textPrimary: undefined, // Use terminal's native foreground
  textMuted: 'gray',
  textInverse: 'white',
  border: 'gray',
  accent: 'cyan',
  selectionBg: 'blue',
  statusOpen: 'white', // Explicit white for visibility on dark backgrounds
  statusInProgress: 'yellow',
  statusBlocked: 'red',
  statusClosed: 'green',
  statusUnknown: 'magenta',
  error: 'red',
};

/**
 * Light theme - designed for light terminal backgrounds.
 * Swaps some colors to maintain contrast and readability.
 */
export const lightTheme: Theme = {
  mode: 'light',
  textPrimary: 'black', // Explicit black for light backgrounds
  textMuted: 'gray',
  textInverse: 'white',
  border: 'gray',
  accent: 'blue', // Cyan is hard to read on light bg
  selectionBg: 'blue', // Blue bg with white text
  statusOpen: 'black', // Explicit black for light backgrounds
  statusInProgress: 'yellow',
  statusBlocked: 'red',
  statusClosed: 'green',
  statusUnknown: 'magenta',
  error: 'red',
};

/**
 * Detect terminal theme from environment variables.
 *
 * Priority:
 * 1. BDX_THEME env var - explicit user override ('dark' or 'light')
 * 2. COLORFGBG env var - set by iTerm2, Konsole, rxvt (format: "fg;bg")
 * 3. Default to 'dark' (most common for developers)
 */
export function detectThemeMode(): ThemeMode {
  // 1. Explicit user override
  const bdxTheme = process.env.BDX_THEME?.toLowerCase();
  if (bdxTheme === 'dark') return 'dark';
  if (bdxTheme === 'light') return 'light';

  // 2. COLORFGBG detection (format: "fg;bg" or "fg;bg;extra")
  // ANSI colors: 0-6 and 8 are dark backgrounds, 7 and 9-15 are light backgrounds
  const colorFgBg = process.env.COLORFGBG;
  if (colorFgBg) {
    const parts = colorFgBg.split(';');
    const bg = Number.parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(bg)) {
      // ANSI color 7 is white/light gray, 9-15 are bright colors (typically light)
      if (bg === 7 || (bg >= 9 && bg <= 15)) return 'light';
      // ANSI colors 0-6 and 8 are dark
      if (bg <= 8) return 'dark';
    }
  }

  // 3. Default to dark (most common for developers)
  return 'dark';
}

// Initial theme mode - determined once at startup
const initialThemeMode = detectThemeMode();

/**
 * Initial theme based on environment detection.
 * @deprecated Use useTheme() hook instead for reactive theme updates.
 */
export const theme: Theme = initialThemeMode === 'light' ? lightTheme : darkTheme;

/**
 * Get theme object for a given mode.
 */
export function getTheme(mode: ThemeMode): Theme {
  return mode === 'light' ? lightTheme : darkTheme;
}

/**
 * React Context for theme.
 * Allows components to reactively update when theme changes.
 */
export const ThemeContext = createContext<Theme>(theme);

/**
 * Hook to access current theme.
 * Use this instead of importing theme directly to support live theme toggling.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
