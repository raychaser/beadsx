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
