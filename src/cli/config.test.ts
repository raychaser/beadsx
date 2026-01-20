import * as fs from 'node:fs';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfigPath, getThemeForDirectory, loadUserConfig } from './config';

// Mock fs and os modules
vi.mock('node:fs');
vi.mock('node:os');

describe('getConfigPath', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses XDG_CONFIG_HOME when set', () => {
    process.env.XDG_CONFIG_HOME = '/custom/config';
    const result = getConfigPath();
    expect(result).toBe('/custom/config/bdx/config.yaml');
  });

  it('defaults to ~/.config when XDG_CONFIG_HOME not set', () => {
    delete process.env.XDG_CONFIG_HOME;
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    const result = getConfigPath();
    expect(result).toBe('/home/user/.config/bdx/config.yaml');
  });
});

describe('loadUserConfig', () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    delete process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns null when config file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = loadUserConfig();
    expect(result).toBeNull();
  });

  it('returns null for empty file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('');
    const result = loadUserConfig();
    expect(result).toBeNull();
  });

  it('returns null for whitespace-only file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('   \n   \n   ');
    const result = loadUserConfig();
    expect(result).toBeNull();
  });

  it('parses valid YAML config', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects
      mode: dark
`);
    const result = loadUserConfig();
    expect(result).toEqual({
      theme: {
        defaults: [{ prefix: '/home/user/projects', mode: 'dark' }],
      },
    });
  });

  it('returns null and logs warning for invalid YAML', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('invalid: yaml: content: [');
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load'));
    warnSpy.mockRestore();
  });

  it('returns null when fs.readFileSync throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to load'));
    warnSpy.mockRestore();
  });
});

describe('getThemeForDirectory', () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    delete process.env.XDG_CONFIG_HOME;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns undefined when no config file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = getThemeForDirectory('/some/path');
    expect(result).toBeUndefined();
  });

  it('returns undefined when config has no theme section', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('other: setting');
    const result = getThemeForDirectory('/some/path');
    expect(result).toBeUndefined();
  });

  it('returns undefined when theme.defaults is empty', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults: []
`);
    const result = getThemeForDirectory('/some/path');
    expect(result).toBeUndefined();
  });

  it('returns undefined when no prefix matches', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /other/path
      mode: dark
`);
    const result = getThemeForDirectory('/some/path');
    expect(result).toBeUndefined();
  });

  it('returns theme for exact path match', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects
      mode: light
`);
    const result = getThemeForDirectory('/home/user/projects');
    expect(result).toBe('light');
  });

  it('returns theme for prefix match (subdirectory)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects
      mode: dark
`);
    const result = getThemeForDirectory('/home/user/projects/subdir/deep');
    expect(result).toBe('dark');
  });

  it('longest matching prefix wins', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user
      mode: light
    - prefix: /home/user/projects
      mode: dark
`);
    const result = getThemeForDirectory('/home/user/projects/app');
    expect(result).toBe('dark');
  });

  it('handles trailing slash in config prefix', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects/
      mode: dark
`);
    const result = getThemeForDirectory('/home/user/projects/app');
    expect(result).toBe('dark');
  });

  it('handles trailing slash in cwd', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects
      mode: dark
`);
    const result = getThemeForDirectory('/home/user/projects/');
    expect(result).toBe('dark');
  });

  it('expands tilde in config prefix', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: ~/projects
      mode: dark
`);
    const result = getThemeForDirectory('/home/user/projects/app');
    expect(result).toBe('dark');
  });

  it('does not match partial directory names', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/proj
      mode: dark
`);
    // /home/user/projects should NOT match /home/user/proj prefix
    const result = getThemeForDirectory('/home/user/projects');
    expect(result).toBeUndefined();
  });

  it('logs warning for invalid mode and continues', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects
      mode: invalid
    - prefix: /home/user
      mode: light
`);
    // Should skip invalid mode and try next prefix
    const result = getThemeForDirectory('/home/user/projects/app');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid theme mode'));
    expect(result).toBe('light');
    warnSpy.mockRestore();
  });

  it('handles multiple trailing slashes', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects///
      mode: dark
`);
    const result = getThemeForDirectory('/home/user/projects/app');
    expect(result).toBe('dark');
  });
});
