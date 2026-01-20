// User configuration for bdx CLI
// Config file location: ~/.config/bdx/config.yaml

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse as parseYaml, YAMLParseError } from 'yaml';
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
 * Type guard to validate a ThemeDefault entry from parsed YAML.
 */
function isValidThemeDefault(entry: unknown): entry is ThemeDefault {
  if (!entry || typeof entry !== 'object') return false;
  const obj = entry as Record<string, unknown>;
  return typeof obj.prefix === 'string' && obj.prefix.trim() !== '';
  // Note: mode is validated separately to allow case-insensitive matching
}

/**
 * Validate parsed YAML has the expected BdxUserConfig structure.
 */
function isValidConfig(parsed: unknown): parsed is BdxUserConfig {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }
  const obj = parsed as Record<string, unknown>;

  // Empty config (no theme key) is valid
  if (obj.theme === undefined) return true;

  // If theme exists, it must be an object
  if (typeof obj.theme !== 'object' || obj.theme === null || Array.isArray(obj.theme)) {
    return false;
  }

  const theme = obj.theme as Record<string, unknown>;

  // If defaults exists, it must be an array
  if (theme.defaults === undefined) return true;
  if (!Array.isArray(theme.defaults)) return false;

  // Each entry must have a valid prefix (mode validated at usage time)
  return theme.defaults.every(isValidThemeDefault);
}

// Cached config to avoid re-reading file on every call
let cachedConfig: BdxUserConfig | null | undefined;

/**
 * Clear the config cache. Useful for testing.
 */
export function clearConfigCache(): void {
  cachedConfig = undefined;
}

/**
 * Load user configuration from ~/.config/bdx/config.yaml
 * Returns null if file doesn't exist or is invalid.
 * Config is cached after first load (restart to apply changes).
 */
export function loadUserConfig(): BdxUserConfig | null {
  // Return cached result if available
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  const configPath = getConfigPath();

  // Check if file exists (before try block to distinguish from other errors)
  if (!fs.existsSync(configPath)) {
    cachedConfig = null;
    return null;
  }

  let content: string;
  try {
    content = fs.readFileSync(configPath, 'utf-8');
  } catch (err) {
    // Handle filesystem errors with specific messages
    if (err instanceof Error && 'code' in err) {
      const fsErr = err as NodeJS.ErrnoException;
      if (fsErr.code === 'EACCES') {
        console.error(`[config] Permission denied reading ${configPath}. Check file permissions.`);
      } else if (fsErr.code === 'ENOENT') {
        // Race condition - file was deleted between existsSync and readFile
        cachedConfig = null;
        return null;
      } else {
        console.error(`[config] Failed to read ${configPath}: ${fsErr.message} (${fsErr.code})`);
      }
    } else {
      console.error(`[config] Unexpected error reading ${configPath}: ${err}`);
    }
    cachedConfig = null;
    return null;
  }

  if (!content.trim()) {
    cachedConfig = null;
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    // YAML parse errors are user-actionable
    if (err instanceof YAMLParseError) {
      console.error(`[config] Invalid YAML in ${configPath}: ${err.message}`);
    } else {
      console.error(`[config] Failed to parse ${configPath}: ${err instanceof Error ? err.message : err}`);
    }
    console.error('[config] Please check the syntax of your config file.');
    cachedConfig = null;
    return null;
  }

  // Validate structure before returning
  if (!isValidConfig(parsed)) {
    console.warn(`[config] ${configPath} has invalid structure. Expected: theme.defaults array with prefix entries.`);
    cachedConfig = null;
    return null;
  }

  cachedConfig = parsed;
  return parsed;
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
 * Mode comparison is case-insensitive ('Dark' works as 'dark').
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

  // Pre-compute normalized paths to avoid redundant computation during sort
  const withNormalized = defaults.map((entry) => ({
    entry,
    normalizedPrefix: normalizePath(entry.prefix),
  }));

  // Sort by prefix length descending (longest match wins)
  const sorted = withNormalized.sort((a, b) => b.normalizedPrefix.length - a.normalizedPrefix.length);

  for (const { entry, normalizedPrefix } of sorted) {
    // Check if cwd starts with prefix (prefix match)
    if (normalizedCwd === normalizedPrefix || normalizedCwd.startsWith(`${normalizedPrefix}/`)) {
      // Validate mode (case-insensitive)
      const normalizedMode = typeof entry.mode === 'string' ? entry.mode.toLowerCase() : entry.mode;
      if (normalizedMode === 'dark' || normalizedMode === 'light') {
        return normalizedMode;
      }
      console.warn(
        `[config] Invalid theme mode "${entry.mode}" for prefix "${entry.prefix}". ` +
          'Expected "dark" or "light".',
      );
    }
  }

  return undefined;
}
