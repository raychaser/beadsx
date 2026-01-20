# Theme Persistence Design

## Problem

Terminal theme detection (OSC 11, COLORFGBG) is unreliable in some environments (tmux, SSH, non-standard terminals). Users need a way to "pin" their preferred theme per project directory.

## Solution

A central config file at `~/.config/bdx/config.yaml` that maps directory prefixes to theme preferences.

## Detection Priority

1. `BDX_THEME` env var (explicit override, highest priority)
2. **~/.config/bdx/config.yaml prefix match** (NEW)
3. OSC 11 terminal query (async)
4. `COLORFGBG` env var
5. Default to dark

## Config File Format

Location: `~/.config/bdx/config.yaml`

```yaml
theme:
  defaults:
    - prefix: /Users/christian/tmux/beadsx
      mode: dark
    - prefix: /Users/christian/projects/docs
      mode: light
```

Matching: longest matching prefix wins.

## Implementation

### New file: `src/cli/config.ts`

- `loadUserConfig()` - reads and parses `~/.config/bdx/config.yaml`
- `getThemeForDirectory(dir: string)` - returns `'dark' | 'light' | undefined`
- Uses `os.homedir()` and `path.join` for XDG path
- Prefix matching: sort by length descending, return first match

### Type definition

```typescript
interface BdxUserConfig {
  theme?: {
    defaults?: Array<{ prefix: string; mode: 'dark' | 'light' }>;
  };
}
```

### Changes to `src/cli/theme.ts`

- New `getConfiguredTheme(cwd: string)` function that calls config loader
- Update `detectThemeModeAsync()` to check config after env var, before OSC 11

### Changes to `src/cli/index.tsx`

- Pass workspace path to theme detection (already available from args)

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No config file | Skip, use terminal detection |
| Empty file | Treat as no config |
| Missing `theme` key | Skip theme config |
| Invalid YAML | Log warning to stderr, continue |
| No matching prefix | Continue to terminal detection |
| Multiple matches | Longest prefix wins |
| Trailing slashes | Normalize paths (strip trailing `/`) |

## Out of Scope

- CLI command to edit config (manual editing is sufficient)
- "Save current theme" feature from `t` toggle
- Config file watcher/hot-reload (restart to apply changes)

## User Workflow

```bash
mkdir -p ~/.config/bdx
cat >> ~/.config/bdx/config.yaml << 'EOF'
theme:
  defaults:
    - prefix: /Users/christian/tmux/beadsx
      mode: dark
EOF
```
