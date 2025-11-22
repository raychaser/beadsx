
## Workflow

The main outer loop:

- Start with a new epic ("next epic", "next thing", ...)
- Make sure you are on the main branch and that it is up-to-date with the latest changes from the remote repository
- Also make sure that there are no outstanding PRs not merged yet
- Figure out a good branch name for the epic and create the branch from latest main
- Create the epic in beads (see below)
- Then enter the main inner loop
  - Plan out the initial tasks for the epic
  - Use beads dependency tracking for structuring tasks
  - Do work, and test the work
  - As you discover new work, create new tasks under the epic or under existing tasks as it makes sense
  - Interact with the user for more input
  - As this leads to more work, create new tasks under the epic or tasks
  - Repeat until the epic is complete
  - **Important** All work is tracked in beads, even one offs that come from chatting with the user
- **Important** Make sure all tests are passing, otherwise go back to the inner loop until they do
- Submit a pull request for review
- Merge the pull request into main


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
