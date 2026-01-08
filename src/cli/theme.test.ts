import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Need to clear module cache between tests to reset singleton
async function resetModuleAndImport() {
  vi.resetModules();
  return await import('./theme');
}

describe('detectThemeMode', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear theme-related env vars
    delete process.env.BDX_THEME;
    delete process.env.COLORFGBG;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('respects BDX_THEME=dark override', async () => {
    process.env.BDX_THEME = 'dark';
    process.env.COLORFGBG = '0;15'; // Would indicate light
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('dark');
  });

  it('respects BDX_THEME=light override', async () => {
    process.env.BDX_THEME = 'light';
    process.env.COLORFGBG = '15;0'; // Would indicate dark
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('light');
  });

  it('is case insensitive for BDX_THEME', async () => {
    process.env.BDX_THEME = 'LIGHT';
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('light');
  });

  it('detects dark from COLORFGBG with bg=0', async () => {
    process.env.COLORFGBG = '15;0';
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('dark');
  });

  it('detects dark from COLORFGBG with bg=8', async () => {
    process.env.COLORFGBG = '7;8';
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('dark');
  });

  it('detects light from COLORFGBG with bg=7 (white)', async () => {
    process.env.COLORFGBG = '0;7';
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('light');
  });

  it('detects light from COLORFGBG with bg=15', async () => {
    process.env.COLORFGBG = '0;15';
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('light');
  });

  it('handles three-part COLORFGBG format', async () => {
    // Some terminals use "fg;bg;extra" format
    process.env.COLORFGBG = '15;0;0';
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('dark');
  });

  it('defaults to dark when no env vars set', async () => {
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('dark');
  });

  it('defaults to dark for invalid BDX_THEME value', async () => {
    process.env.BDX_THEME = 'invalid';
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('dark');
  });

  it('defaults to dark for invalid COLORFGBG format', async () => {
    process.env.COLORFGBG = 'invalid';
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('dark');
  });

  it('defaults to dark for COLORFGBG with bg > 15 (unusual value)', async () => {
    process.env.COLORFGBG = '0;200';
    const { detectThemeMode } = await resetModuleAndImport();
    expect(detectThemeMode()).toBe('dark');
  });

  it('logs warning for invalid BDX_THEME value', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.BDX_THEME = 'invalid';
    const { detectThemeMode } = await resetModuleAndImport();
    detectThemeMode();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid BDX_THEME value'));
    warnSpy.mockRestore();
  });

  it('logs debug for invalid COLORFGBG format', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    process.env.COLORFGBG = 'invalid';
    const { detectThemeMode } = await resetModuleAndImport();
    detectThemeMode();
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('Could not parse COLORFGBG'));
    debugSpy.mockRestore();
  });

  it('logs debug for unusual COLORFGBG background value', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    process.env.COLORFGBG = '0;200';
    const { detectThemeMode } = await resetModuleAndImport();
    detectThemeMode();
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unusual COLORFGBG background value'),
    );
    debugSpy.mockRestore();
  });
});

describe('theme objects', () => {
  it('dark theme has expected properties', async () => {
    const { darkTheme } = await resetModuleAndImport();
    expect(darkTheme.mode).toBe('dark');
    expect(darkTheme.textPrimary).toBeUndefined(); // Uses terminal default
    expect(darkTheme.textMuted).toBe('gray');
    expect(darkTheme.accent).toBe('cyan');
    expect(darkTheme.selectionBg).toBe('blue');
    expect(darkTheme.statusClosed).toBe('green');
    expect(darkTheme.statusInProgress).toBe('yellow');
    expect(darkTheme.statusBlocked).toBe('red');
    expect(darkTheme.error).toBe('red');
  });

  it('light theme has expected properties', async () => {
    const { lightTheme } = await resetModuleAndImport();
    expect(lightTheme.mode).toBe('light');
    expect(lightTheme.textPrimary).toBe('black'); // Explicit for light backgrounds
    expect(lightTheme.textMuted).toBe('gray');
    expect(lightTheme.accent).toBe('blue'); // Different from dark
    expect(lightTheme.selectionBg).toBe('blue'); // Different from dark
    expect(lightTheme.statusClosed).toBe('green');
    expect(lightTheme.statusInProgress).toBe('yellow');
    expect(lightTheme.statusBlocked).toBe('red');
    expect(lightTheme.error).toBe('red');
  });

  it('dark theme is frozen (immutable at runtime)', async () => {
    const { darkTheme } = await resetModuleAndImport();
    expect(Object.isFrozen(darkTheme)).toBe(true);
  });

  it('light theme is frozen (immutable at runtime)', async () => {
    const { lightTheme } = await resetModuleAndImport();
    expect(Object.isFrozen(lightTheme)).toBe(true);
  });

  it('throws when trying to modify frozen theme', async () => {
    const { darkTheme } = await resetModuleAndImport();
    expect(() => {
      // @ts-expect-error - intentionally testing runtime immutability
      darkTheme.mode = 'light';
    }).toThrow(TypeError);
  });
});

describe('theme singleton', () => {
  it('exports correct theme based on env', async () => {
    process.env.BDX_THEME = 'light';
    const { theme } = await resetModuleAndImport();
    expect(theme.mode).toBe('light');
  });

  it('defaults to dark theme', async () => {
    // Ensure env vars are cleared for this test
    delete process.env.BDX_THEME;
    delete process.env.COLORFGBG;
    const { theme } = await resetModuleAndImport();
    expect(theme.mode).toBe('dark');
  });
});

describe('calculateLuminance', () => {
  it('returns 0 for black', async () => {
    const { calculateLuminance } = await resetModuleAndImport();
    expect(calculateLuminance(0, 0, 0)).toBe(0);
  });

  it('returns 1 for white', async () => {
    const { calculateLuminance } = await resetModuleAndImport();
    expect(calculateLuminance(1, 1, 1)).toBe(1);
  });

  it('returns ~0.21 for pure red', async () => {
    const { calculateLuminance } = await resetModuleAndImport();
    // Red coefficient is 0.2126 in WCAG formula
    const lum = calculateLuminance(1, 0, 0);
    expect(lum).toBeCloseTo(0.2126, 3);
  });

  it('returns ~0.72 for pure green', async () => {
    const { calculateLuminance } = await resetModuleAndImport();
    // Green coefficient is 0.7152 in WCAG formula
    const lum = calculateLuminance(0, 1, 0);
    expect(lum).toBeCloseTo(0.7152, 3);
  });

  it('returns ~0.07 for pure blue', async () => {
    const { calculateLuminance } = await resetModuleAndImport();
    // Blue coefficient is 0.0722 in WCAG formula
    const lum = calculateLuminance(0, 0, 1);
    expect(lum).toBeCloseTo(0.0722, 3);
  });

  it('returns ~0.22 for mid-gray (gamma-corrected)', async () => {
    const { calculateLuminance } = await resetModuleAndImport();
    // 50% gray is around 0.214 after gamma correction
    const lum = calculateLuminance(0.5, 0.5, 0.5);
    expect(lum).toBeGreaterThan(0.2);
    expect(lum).toBeLessThan(0.25);
  });
});

describe('detectThemeModeAsync', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.BDX_THEME;
    delete process.env.COLORFGBG;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('respects BDX_THEME=dark override', async () => {
    process.env.BDX_THEME = 'dark';
    const { detectThemeModeAsync } = await resetModuleAndImport();
    const result = await detectThemeModeAsync();
    expect(result).toBe('dark');
  });

  it('respects BDX_THEME=light override', async () => {
    process.env.BDX_THEME = 'light';
    const { detectThemeModeAsync } = await resetModuleAndImport();
    const result = await detectThemeModeAsync();
    expect(result).toBe('light');
  });

  it('falls back to sync detection when not a TTY', async () => {
    // In test environment, stdin/stdout are not TTYs, so OSC 11 is skipped
    // This should fall back to COLORFGBG or default dark
    process.env.COLORFGBG = '0;15'; // Light background
    const { detectThemeModeAsync } = await resetModuleAndImport();
    const result = await detectThemeModeAsync();
    expect(result).toBe('light');
  });

  it('defaults to dark when no detection available', async () => {
    // No env vars, not a TTY - should default to dark
    const { detectThemeModeAsync } = await resetModuleAndImport();
    const result = await detectThemeModeAsync();
    expect(result).toBe('dark');
  });
});

describe('getTheme', () => {
  it('returns dark theme for dark mode', async () => {
    const { getTheme, darkTheme } = await resetModuleAndImport();
    expect(getTheme('dark')).toBe(darkTheme);
  });

  it('returns light theme for light mode', async () => {
    const { getTheme, lightTheme } = await resetModuleAndImport();
    expect(getTheme('light')).toBe(lightTheme);
  });

  it('returns frozen (immutable) theme objects', async () => {
    const { getTheme } = await resetModuleAndImport();
    expect(Object.isFrozen(getTheme('dark'))).toBe(true);
    expect(Object.isFrozen(getTheme('light'))).toBe(true);
  });
});

describe('parseOsc11Response', () => {
  it('returns light for white background (4-digit hex)', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    // White background: rgb:ffff/ffff/ffff
    const result = parseOsc11Response('\x1b]11;rgb:ffff/ffff/ffff\x07');
    expect(result).toBe('light');
  });

  it('returns dark for black background (4-digit hex)', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    // Black background: rgb:0000/0000/0000
    const result = parseOsc11Response('\x1b]11;rgb:0000/0000/0000\x07');
    expect(result).toBe('dark');
  });

  it('handles 2-digit hex format', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    // White in 2-digit format: rgb:ff/ff/ff
    const result = parseOsc11Response('\x1b]11;rgb:ff/ff/ff\x07');
    expect(result).toBe('light');
  });

  it('handles ST terminator (\\x1b\\\\)', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    // Some terminals use ST instead of BEL
    const result = parseOsc11Response('\x1b]11;rgb:0000/0000/0000\x1b\\');
    expect(result).toBe('dark');
  });

  it('returns dark for typical dark theme background', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    // Typical dark background: rgb:1c1c/1c1c/1c1c (dark gray)
    const result = parseOsc11Response('\x1b]11;rgb:1c1c/1c1c/1c1c\x07');
    expect(result).toBe('dark');
  });

  it('returns light for typical light theme background', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    // Typical light background: rgb:f5f5/f5f5/f5f5 (off-white)
    const result = parseOsc11Response('\x1b]11;rgb:f5f5/f5f5/f5f5\x07');
    expect(result).toBe('light');
  });

  it('returns null for invalid format', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    const result = parseOsc11Response('invalid');
    expect(result).toBeNull();
  });

  it('returns null for empty string', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    const result = parseOsc11Response('');
    expect(result).toBeNull();
  });

  it('extracts RGB from partial/buffered response', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    // Response might have extra characters from buffering
    const result = parseOsc11Response('garbage\x1b]11;rgb:ffff/ffff/ffff\x07more');
    expect(result).toBe('light');
  });

  it('returns null for non-hex characters in response', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    // Non-hex characters don't match the regex, returning null
    const result = parseOsc11Response('\x1b]11;rgb:gggg/ffff/ffff\x07');
    expect(result).toBeNull();
  });

  it('returns null when any color component has non-hex characters', async () => {
    const { parseOsc11Response } = await resetModuleAndImport();
    // Second component has non-hex characters
    const result = parseOsc11Response('\x1b]11;rgb:ffff/xxxx/ffff\x07');
    expect(result).toBeNull();
  });

  it('handles edge case of regex matching but parseInt failing', async () => {
    // The regex [0-9a-fA-F]+ ensures only valid hex reaches parseHexColor.
    // This test verifies the overall behavior - invalid format returns null.
    const { parseOsc11Response } = await resetModuleAndImport();
    // Verify regex correctly filters invalid hex
    expect(parseOsc11Response('\x1b]11;rgb:zzzz/ffff/ffff\x07')).toBeNull();
    // Verify valid hex is processed correctly
    expect(parseOsc11Response('\x1b]11;rgb:ffff/ffff/ffff\x07')).toBe('light');
  });
});
