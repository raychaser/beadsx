// User configuration for bdx CLI
// Config file location: ~/.config/bdx/config.yaml

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ThemeMode } from './theme';

/**
 * Theme preference entry - maps a directory prefix to a theme mode.
 */
export interface ThemeDefault {
  prefix: string;
  mode: ThemeMode;
}

/**
 * User configuration structure for ~/.config/bdx/config.yaml
 */
export interface BdxUserConfig {
  theme?: {
    defaults?: ThemeDefault[];
  };
}

/**
 * Get the path to the user config file.
 * Uses XDG standard: ~/.config/bdx/config.yaml
 */
export function getConfigPath(): string {
  const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configDir, 'bdx', 'config.yaml');
}

/**
 * Load user configuration from ~/.config/bdx/config.yaml
 * Returns null if file doesn't exist or is invalid.
 */
export function loadUserConfig(): BdxUserConfig | null {
  const configPath = getConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    if (!content.trim()) {
      return null;
    }

    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as BdxUserConfig;
  } catch (err) {
    // Log warning but don't fail - continue with terminal detection
    console.warn(`[config] Failed to load ${configPath}: ${err}`);
    return null;
  }
}

/**
 * Normalize a directory path for comparison.
 * - Resolves to absolute path
 * - Removes trailing slashes
 */
function normalizePath(p: string): string {
  // Expand ~ to home directory
  if (p.startsWith('~/')) {
    p = path.join(os.homedir(), p.slice(2));
  }
  // Resolve to absolute and remove trailing slash
  return path.resolve(p).replace(/\/+$/, '');
}

/**
 * Get the configured theme for a directory.
 * Matches against prefix entries, longest match wins.
 *
 * @param cwd - Current working directory to match
 * @returns Theme mode if a prefix matches, undefined otherwise
 */
export function getThemeForDirectory(cwd: string): ThemeMode | undefined {
  const config = loadUserConfig();
  if (!config?.theme?.defaults?.length) {
    return undefined;
  }

  const normalizedCwd = normalizePath(cwd);
  const defaults = config.theme.defaults;

  // Sort by prefix length descending (longest match wins)
  const sorted = [...defaults].sort((a, b) => {
    const lenA = normalizePath(a.prefix).length;
    const lenB = normalizePath(b.prefix).length;
    return lenB - lenA;
  });

  for (const entry of sorted) {
    const normalizedPrefix = normalizePath(entry.prefix);
    // Check if cwd starts with prefix (prefix match)
    if (normalizedCwd === normalizedPrefix || normalizedCwd.startsWith(`${normalizedPrefix}/`)) {
      // Validate mode
      if (entry.mode === 'dark' || entry.mode === 'light') {
        return entry.mode;
      }
      console.warn(`[config] Invalid theme mode "${entry.mode}" for prefix "${entry.prefix}"`);
    }
  }

  return undefined;
}
