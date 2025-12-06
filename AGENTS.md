## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### CRITICAL: Track ALL Work in Beads

**Every piece of work gets a beads issue - no exceptions.** This includes:

- ✅ Planned epics and tasks
- ✅ Quick fixes from conversation ("can you just...")
- ✅ One-off iterations and refinements
- ✅ Small changes discovered during chat
- ✅ Even tiny tweaks

**Why this matters:**

- Maintains complete history of what was done
- Keeps beads in sync with actual code state
- Prevents "ghost work" that's done but not recorded
- Makes it easy to see what happened in a session

**The workflow for ANY request:**

1. User asks for something → **Create beads task first**
2. Mark task `in_progress`
3. Do the work
4. Close the task with reason
5. Commit beads changes with code

**Never do this:**

- ❌ "Let me just quickly fix that..." without creating a task
- ❌ Doing work then forgetting to track it
- ❌ Batching multiple small fixes without individual tasks
- ❌ Treating conversational requests as "not real work"

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):

```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

## Database Migration Workflow

This project uses Drizzle with separate dev and test schemas. **Always keep both schemas in sync.**

### Key Commands

```bash
# Push schema changes to BOTH dev and test (preferred)
pnpm db:push

# Run migrations on BOTH dev and test
pnpm db:migrate

# Generate migrations for BOTH dev and test
pnpm db:generate

# Sync test schema only (also runs automatically before tests)
pnpm db:test:sync
```

**Note:** The `pretest` hook automatically syncs the test schema before running tests. This ensures tests always run against the correct schema, even if you forgot to run `db:push` after schema changes.

### Schema Change Workflow

1. **Modify schema files** in `packages/db/src/schema/`
2. **Generate migrations** (if using migrations):
   ```bash
   pnpm db:generate
   ```
3. **Push to both databases**:
   ```bash
   pnpm db:push
   ```
4. **Verify tests pass**:
   ```bash
   pnpm test
   ```
5. **Commit together**: Schema changes, migrations, AND beads updates

### Fixing Out-of-Sync Schemas

If tests fail with errors like "column does not exist" or "relation does not exist":

1. **Check which schema is out of sync**:

   ```bash
   # Compare dev schema
   pnpm db:dev:push --dry-run

   # Compare test schema
   pnpm db:test:push --dry-run
   ```

2. **Push to fix the drift**:

   ```bash
   pnpm db:push
   ```

3. **Re-run tests** to verify the fix

## E2E Testing

E2E tests live in `packages/frontend/e2e/` and test the full UI flow.

### Key Commands

```bash
# Run e2e tests (from root or frontend package)
pnpm test:e2e
# or
cd packages/frontend && pnpm test:e2e

# Run with UI for debugging
pnpm test:e2e:ui
```

### CRITICAL: Run E2E Tests for UI Changes

**Always run `pnpm test:e2e` when making changes to the frontend:**

- Component changes
- Page changes
- Styling changes
- Any UI-related modifications

This ensures you don't break existing functionality. The e2e tests use Playwright and run against a production build with a test database.

### Test Structure

- Tests are in `packages/frontend/e2e/*.spec.ts`
- Config is in `packages/frontend/playwright.config.ts`
- Tests run on port 24090 with `commotion_test` schema
- Uses 8 parallel workers and list reporter

### Validating UI Changes with Playwright MCP

**Use the Playwright MCP server to validate UI changes as you work:**

- Navigate to `localhost:24000` (the running dev server) using `mcp__playwright__browser_navigate`
- Take snapshots with `mcp__playwright__browser_snapshot` to see the page state
- Click elements, fill forms, and interact with the UI to verify changes
- Take screenshots with `mcp__playwright__browser_take_screenshot` for visual verification

**Do NOT start a new dev server** - use the existing one on port 24000.

This allows you to visually confirm your changes work before running the full e2e test suite.

### Important Rules

- ✅ Always use `db:*` commands instead of individual `db:dev:*` or `db:test:*`
- ✅ Commit schema changes together with migrations and beads updates
- ✅ Run tests after any schema change to catch drift early
- ❌ Do NOT run `db:dev:push` without also running `db:test:push`
- ❌ Do NOT skip the test schema when making changes

### Managing AI-Generated Planning Documents

AI assistants often create planning and design documents during development:

- PLAN.md, IMPLEMENTATION.md, ARCHITECTURE.md
- DESIGN.md, CODEBASE_SUMMARY.md, INTEGRATION_PLAN.md
- TESTING_GUIDE.md, TECHNICAL_DESIGN.md, and similar files

**Best Practice: Use a dedicated directory for these ephemeral files**

**Recommended approach:**

- Create a `history/` directory in the project root
- Store ALL AI-generated planning/design docs in `history/`
- Keep the repository root clean and focused on permanent project files
- Only access `history/` when explicitly asked to review past planning

**Example .gitignore entry (optional):**

```
# AI planning documents (ephemeral)
history/
```

**Benefits:**

- ✅ Clean repository root
- ✅ Clear separation between ephemeral and permanent documentation
- ✅ Easy to exclude from version control if desired
- ✅ Preserves planning history for archeological research
- ✅ Reduces noise when browsing the project

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ✅ Store AI planning docs in `history/` directory
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems
- ❌ Do NOT clutter repo root with planning documents

For more details, see README.md and QUICKSTART.md.

## Using bv as an AI sidecar

bv is a fast terminal UI for Beads projects (.beads/beads.jsonl). It renders lists/details and precomputes dependency metrics (PageRank, critical path, cycles, etc.) so you instantly see blockers and execution order. For agents, it’s a graph sidecar: instead of parsing JSONL or risking hallucinated traversal, call the robot flags to get deterministic, dependency-aware outputs.

- bv --robot-help — shows all AI-facing commands.
- bv --robot-insights — JSON graph metrics (PageRank, betweenness, HITS, critical path, cycles) with top-N summaries for quick triage.
- bv --robot-plan — JSON execution plan: parallel tracks, items per track, and unblocks lists showing what each item frees up.
- bv --robot-priority — JSON priority recommendations with reasoning and confidence.
- bv --robot-recipes — list recipes (default, actionable, blocked, etc.); apply via bv --recipe <name> to pre-filter/sort before other flags.
- bv --robot-diff --diff-since <commit|date> — JSON diff of issue changes, new/closed items, and cycles introduced/resolved.

Use these commands instead of hand-rolling graph logic; bv already computes the hard parts so agents can act safely and quickly.
