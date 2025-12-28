# bdx CLI Design

A terminal UI for beads issue tracking, reusing the BeadsX VS Code extension's core logic.

## Overview

`bdx` is an interactive TUI that mirrors the VS Code extension's tree view experience:
- Same filters: All, Open, Ready, Recent
- Same hierarchy display with expand/collapse
- Same auto-refresh behavior
- Keyboard-driven navigation

Built with OpenTUI (React reconciler for terminal).

## Project Structure

```
phoenix/
├── src/
│   ├── core/                    # Shared business logic
│   │   ├── beadsService.ts      # BD command execution, parsing
│   │   ├── types.ts             # BeadsIssue, BeadsDependency, etc.
│   │   └── utils.ts             # Sorting, formatting
│   │
│   ├── extension/               # VS Code extension
│   │   ├── extension.ts
│   │   └── beadsTreeDataProvider.ts
│   │
│   └── cli/                     # bdx TUI
│       ├── index.tsx            # Entry point
│       ├── App.tsx              # Main component
│       ├── components/
│       │   ├── FilterBar.tsx
│       │   ├── IssueTree.tsx
│       │   ├── IssueRow.tsx
│       │   └── StatusBar.tsx
│       └── hooks/
│           ├── useIssues.ts
│           └── useKeyboard.ts
│
├── bin/
│   └── bdx.js                   # CLI entry shim
└── package.json
```

## UI Layout

Minimal chrome, no box borders:

```
 Filter: [Recent] All  Open  Ready  Recent       ↻ 5s ago

 ▼ BEADS-001 Epic: CLI version of BeadsX            P2 ●
   ├─ BEADS-002 Extract core logic                  P2 ✓
   ├─ BEADS-003 Set up OpenTUI                      P2 ●
   └─ BEADS-004 Implement tree view                 P2 ○
 ▶ BEADS-005 Fix sync issue                         P1 ○
   BEADS-006 Update docs                            P3 ○

 6 issues (3 open, 2 in progress, 1 closed)   q:quit r:refresh
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| `↑/↓` or `j/k` | Move selection |
| `←/→` or `h/l` | Collapse/expand |
| `1/2/3/4` | Switch filter (All/Open/Ready/Recent) |
| `r` | Force refresh |
| `q` or `Ctrl+C` | Quit |

## Core Extraction

Remove VS Code dependencies from beadsService.ts:

```typescript
// src/core/types.ts
export interface BeadsConfig {
  commandPath?: string;
  shortIds?: boolean;
}

export interface Logger {
  log(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}
```

```typescript
// src/core/beadsService.ts
let config: BeadsConfig = {};
let logger: Logger = console;

export function configure(c: BeadsConfig, l?: Logger) {
  config = c;
  if (l) logger = l;
}
```

## Dependencies

```json
{
  "dependencies": {
    "@opentui/core": "^0.1.63",
    "@opentui/react": "^0.1.63"
  }
}
```

## Build & Run

```bash
# Development
bun run src/cli/index.tsx

# Production
bun build src/cli/index.tsx --outdir dist/cli --target node
bdx
```

## Implementation Order

1. Extract core logic to src/core/
2. Set up OpenTUI with minimal hello world
3. Build static components (FilterBar, IssueTree, StatusBar)
4. Wire up real data from beadsService
5. Add keyboard navigation and filter switching
6. Add auto-refresh
7. Polish (error states, --help, edge cases)
