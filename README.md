# BeadsX Extension

A VSCode extension that provides a panel for viewing and managing [beads](https://github.com/steveyegge/beads) issue tracking state.

## Installation

### From Marketplace (Recommended)

Install directly from:

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=raychaser.beadsx)
- [Open VSX Registry](https://open-vsx.org/extension/raychaser/beadsx) (for VSCodium, Gitpod, etc.)

Or search for "BeadsX" in the Extensions view.

### From VSIX

Download the `.vsix` file from [GitHub Releases](https://github.com/raychaser/beadsx/releases) and install:

```bash
code --install-extension beadsx-*.vsix
```

## Requirements

- [beads](https://github.com/steveyegge/beads) (`bd` CLI) must be installed and available in PATH
- A beads-initialized project (`.beads/` directory)

## Features

### Issue Tree View

- **Hierarchical display**: Issues organized by parent-child and blocking dependencies
- **Issue type icons**: Visual indicators for bug, feature, epic, chore, and task types
- **Status indicators**: `[O]` open, `[>]` in progress, `[B]` blocked, `[C]` closed
- **Smart expansion**: Open/in-progress issues auto-expand to show children

### Filtering

Filter issues using the filter icon in the panel toolbar:

| Filter     | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| **All**    | Show all issues regardless of status                          |
| **Open**   | Show only open and in-progress issues                         |
| **Ready**  | Show issues ready to work (no blockers)                       |
| **Recent** | Show open issues + recently closed (configurable time window) |

Filter selection persists across restarts.

### Issue Detail Panel

Double-click any issue to open a detail panel showing:

- Full issue information (title, description, status, priority)
- Dependencies and dependents
- Creation and update timestamps

### Auto-Reload

Issues automatically refresh at a configurable interval (default: 10 seconds). Disable by setting to 0.

### Short IDs

Optionally display shortened issue IDs without the prefix (e.g., "123" instead of "beadsx-123") to save space.

## Configuration

Access settings via: **Settings → Extensions → BeadsX Extension**

| Setting                      | Default | Description                                       |
| ---------------------------- | ------- | ------------------------------------------------- |
| `beadsx.autoReloadInterval`  | `10`    | Seconds between auto-refresh (0 to disable)       |
| `beadsx.commandPath`         | `""`    | Path to `bd` command (empty = use PATH)           |
| `beadsx.autoExpandOpen`      | `true`  | Auto-expand open/in-progress issues               |
| `beadsx.shortIds`            | `false` | Show IDs without prefix                           |
| `beadsx.recentWindowMinutes` | `60`    | Time window for "Recent" filter (1-10080 minutes) |

## Usage

1. Open a project with beads initialized (`.beads/` directory)
2. Click the Beads icon in the activity bar (checklist icon)
3. View your issues in the tree view
4. Double-click an issue to see full details
5. Use the filter icon to switch between views

### Commands

| Command            | Description                                               |
| ------------------ | --------------------------------------------------------- |
| **Filter Issues**  | Click filter icon to switch between All/Open/Ready/Recent |
| **Refresh Issues** | Click refresh icon to manually reload                     |
