# BeadsX Extension

A VSCode extension that provides a panel for viewing and managing beads issue tracking state.

## Features

- **Issue Tree View**: Displays issues in a hierarchical tree based on parent-child dependencies
- **Issue Type Icons**: Visual indicators for bug, feature, epic, chore, and task types
- **Status Indicators**: `[C]` closed, `[O]` open, `[B]` blocked, `[>]` in progress
- **Filtering**: Filter issues by all, open, or ready (unblocked)
- **Auto-reload**: Automatically refresh issues at a configurable interval
- **Persistent Settings**: Filter selection persists across restarts

## Requirements

- [beads](https://github.com/raychaser/beads) (`bd` CLI) must be installed and available in PATH
- A beads-initialized project (`.beads/` directory)

## Installation

### From Source

```bash
# Clone and install dependencies
pnpm install

# Build and install extension
pnpm install-ext

# Reload VSCode window (Cmd+Shift+P → "Developer: Reload Window")
```

### From VSIX

```bash
pnpm package
code --install-extension beadsx-*.vsix --force
```

## Configuration

Access settings via: Settings → Extensions → BeadsX Extension

| Setting                    | Default | Description                                                       |
| -------------------------- | ------- | ----------------------------------------------------------------- |
| `beads.autoReloadInterval` | `10`    | Interval in seconds to automatically reload issues (0 to disable) |

## Usage

1. Open a project with beads initialized (`.beads/` directory)
2. Click the Beads icon in the activity bar (checklist icon)
3. View your issues in the tree view

### Commands

- **Filter Issues**: Click the filter icon to filter by all/open/ready
- **Refresh Issues**: Click the refresh icon to manually reload

### Tree View

- Issues are organized hierarchically based on parent-child dependencies
- Epics and parent issues appear at the top level
- Child tasks are nested underneath
- Open issues start expanded, closed issues start collapsed

## License

MIT
