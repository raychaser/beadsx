import * as fs from 'node:fs';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache, getConfigPath, getThemeForDirectory, loadUserConfig } from './config';

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
    clearConfigCache(); // Clear cache before each test
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

  it('returns null and logs error for invalid YAML', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('invalid: yaml: content: [');
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid YAML'));
    errorSpy.mockRestore();
  });

  it('returns null when fs.readFileSync throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Permission denied');
    });
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Unexpected error'));
    errorSpy.mockRestore();
  });

  it('returns null when YAML parses to a non-object value', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('just a string');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid structure'));
    warnSpy.mockRestore();
  });

  it('returns null when YAML parses to an array', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('- item1\n- item2');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid structure'));
    warnSpy.mockRestore();
  });

  it('returns null when YAML content is explicit null', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('~');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid structure'));
    warnSpy.mockRestore();
  });

  it('returns null when theme.defaults is not an array', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults: "not-an-array"
`);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid structure'));
    warnSpy.mockRestore();
  });

  it('returns null when entry is missing prefix', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - mode: dark
`);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid structure'));
    warnSpy.mockRestore();
  });

  it('returns null when prefix is not a string', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: 123
      mode: dark
`);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid structure'));
    warnSpy.mockRestore();
  });

  it('logs specific error for permission denied', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      const err = new Error('EACCES') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    });
    const result = loadUserConfig();
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
    errorSpy.mockRestore();
  });

  it('caches config after first load', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects
      mode: dark
`);
    const result1 = loadUserConfig();
    const result2 = loadUserConfig();
    expect(result1).toEqual(result2);
    // readFileSync should only be called once due to caching
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });
});

describe('getThemeForDirectory', () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue('/home/user');
    delete process.env.XDG_CONFIG_HOME;
    clearConfigCache(); // Clear cache before each test
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

  it('handles case-insensitive mode (Dark -> dark)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects
      mode: Dark
`);
    const result = getThemeForDirectory('/home/user/projects/app');
    expect(result).toBe('dark');
  });

  it('handles case-insensitive mode (LIGHT -> light)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(`
theme:
  defaults:
    - prefix: /home/user/projects
      mode: LIGHT
`);
    const result = getThemeForDirectory('/home/user/projects/app');
    expect(result).toBe('light');
  });
});
