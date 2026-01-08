// Theme system for terminal dark/light mode support

import { createContext, useContext } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface Theme {
  readonly mode: ThemeMode;
  // Text colors
  readonly textPrimary: string | undefined; // Main content (undefined = terminal default)
  readonly textMuted: string; // De-emphasized text
  readonly textInverse: string; // Text on highlighted backgrounds
  // UI chrome
  readonly border: string; // Tree lines, separators
  // Interactive
  readonly accent: string; // Active indicators, emphasis
  readonly selectionBg: string; // Selected row background
  // Status colors
  readonly statusOpen: string; // Open issues
  readonly statusInProgress: string; // In-progress issues
  readonly statusBlocked: string; // Blocked issues
  readonly statusClosed: string; // Closed issues
  readonly statusUnknown: string; // Unknown/error states
  // Feedback
  readonly error: string; // Error messages
}

/**
 * Dark theme - designed for dark terminal backgrounds.
 * Uses terminal default for primary text to ensure native appearance.
 */
export const darkTheme: Readonly<Theme> = Object.freeze({
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
});

/**
 * Light theme - designed for light terminal backgrounds.
 * Swaps some colors to maintain contrast and readability.
 */
export const lightTheme: Readonly<Theme> = Object.freeze({
  mode: 'light',
  textPrimary: 'black', // Explicit black for light backgrounds
  textMuted: 'gray',
  textInverse: 'white',
  border: 'gray',
  accent: 'blue', // Better contrast than cyan on light backgrounds
  selectionBg: 'blue', // Selection highlight (text uses inverse color)
  statusOpen: 'black', // Explicit black for light backgrounds
  statusInProgress: 'yellow',
  statusBlocked: 'red',
  statusClosed: 'green',
  statusUnknown: 'magenta',
  error: 'red',
});

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
  if (bdxTheme) {
    console.warn(
      `[theme] Invalid BDX_THEME value "${process.env.BDX_THEME}", expected "dark" or "light"`,
    );
  }

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
      // Unusual value outside expected range
      console.debug(`[theme] Unusual COLORFGBG background value: ${bg}, defaulting to dark`);
    } else {
      console.debug(`[theme] Could not parse COLORFGBG: "${colorFgBg}", ignoring`);
    }
  }

  // 3. Default to dark (most common for developers)
  return 'dark';
}

/**
 * Calculate relative luminance using WCAG formula.
 * Returns 0-1 where 0 is black and 1 is white.
 * @see https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
export function calculateLuminance(r: number, g: number, b: number): number {
  const adjust = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b);
}

/**
 * Parse a hex color component from OSC 11 response.
 * Handles both 2-digit (00-FF) and 4-digit (0000-FFFF) formats.
 * Returns normalized value in range 0-1, or null if parsing fails.
 */
function parseHexColor(hex: string): number | null {
  const val = parseInt(hex, 16);
  if (Number.isNaN(val)) {
    console.debug(`[theme] Invalid hex color component: "${hex}"`);
    return null;
  }
  const max = hex.length === 2 ? 255 : 65535;
  return val / max;
}

/**
 * Query terminal background color using OSC 11 escape sequence.
 * Returns RGB values normalized to 0-1, or null if unsupported/timeout.
 *
 * OSC 11 is widely supported: iTerm2, macOS Terminal, Kitty, Alacritty, Windows Terminal, xterm-compatible.
 * Terminals that don't support it simply won't respond, triggering the timeout.
 */
async function queryTerminalBackground(
  timeoutMs = 100,
): Promise<{ r: number; g: number; b: number } | null> {
  // Skip if not a TTY (pipes, tests, etc.)
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  return new Promise((resolve) => {
    // Save raw mode state to restore later
    const wasRaw = process.stdin.isRaw;
    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      process.stdin.off('data', onData);
      // Restore original raw mode state
      if (process.stdin.isTTY && process.stdin.isRaw !== wasRaw) {
        try {
          process.stdin.setRawMode(wasRaw);
        } catch (err) {
          // Ignore errors restoring raw mode (stream may be closed)
          console.debug(`[theme] Could not restore raw mode: ${err}`);
        }
      }
    };

    const timeout = setTimeout(() => {
      console.debug('[theme] OSC 11 query timed out, falling back to COLORFGBG/default');
      cleanup();
      resolve(null);
    }, timeoutMs);

    const onData = (data: Buffer) => {
      cleanup();

      // Parse response: \x1b]11;rgb:RRRR/GGGG/BBBB\x07 (or \x1b\\ terminator)
      const response = data.toString();
      const match = response.match(/rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/);
      if (match) {
        const r = parseHexColor(match[1]);
        const g = parseHexColor(match[2]);
        const b = parseHexColor(match[3]);
        if (r === null || g === null || b === null) {
          console.debug('[theme] Invalid color values in OSC 11 response');
          resolve(null);
          return;
        }
        resolve({ r, g, b });
      } else {
        console.debug('[theme] Received invalid OSC 11 response, ignoring');
        resolve(null);
      }
    };

    // Enable raw mode to read terminal response
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
    } catch (err) {
      console.debug(`[theme] Failed to set raw mode: ${err}, skipping OSC 11 query`);
      cleanup();
      resolve(null);
      return;
    }

    process.stdin.once('data', onData);

    // Send OSC 11 query (BEL terminator works more broadly than ST)
    const written = process.stdout.write('\x1b]11;?\x07');
    if (!written) {
      console.debug('[theme] stdout buffer full, skipping OSC 11 query');
      cleanup();
      resolve(null);
    }
  });
}

/**
 * Async theme detection with OSC 11 support.
 *
 * Priority:
 * 1. BDX_THEME env var - explicit user override
 * 2. OSC 11 query - dynamic terminal background detection
 * 3. COLORFGBG env var - fallback for terminals without OSC 11
 * 4. Default to dark
 */
export async function detectThemeModeAsync(): Promise<ThemeMode> {
  // 1. Explicit user override
  const bdxTheme = process.env.BDX_THEME?.toLowerCase();
  if (bdxTheme === 'dark') return 'dark';
  if (bdxTheme === 'light') return 'light';

  // 2. OSC 11 query (if TTY)
  const bg = await queryTerminalBackground(100);
  if (bg) {
    const luminance = calculateLuminance(bg.r, bg.g, bg.b);
    // Threshold of 0.5 separates light from dark backgrounds
    return luminance > 0.5 ? 'light' : 'dark';
  }

  // 3. Fallback to sync detection (COLORFGBG + default)
  return detectThemeMode();
}

/**
 * Parse an OSC 11 response string and determine the theme mode.
 * Returns the detected theme mode, or null if the string is not a valid OSC 11 response.
 *
 * OSC 11 response format: \x1b]11;rgb:RRRR/GGGG/BBBB\x07 (or \x1b\\ terminator)
 * Some terminals use 2-digit hex (00-FF), others use 4-digit (0000-FFFF).
 */
export function parseOsc11Response(response: string): ThemeMode | null {
  const match = response.match(/rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/);
  if (!match) return null;

  const r = parseHexColor(match[1]);
  const g = parseHexColor(match[2]);
  const b = parseHexColor(match[3]);
  if (r === null || g === null || b === null) {
    return null;
  }
  const luminance = calculateLuminance(r, g, b);

  return luminance > 0.5 ? 'light' : 'dark';
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
export function getTheme(mode: ThemeMode): Readonly<Theme> {
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
