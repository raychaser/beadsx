**Note**: This project uses [bd (beads)](https://github.com/steveyegge/beads)
for issue tracking. Use `bd` commands instead of markdown TODOs.
See AGENTS.md for workflow details.

# Superpowers + Beads Integration

This project uses both the **superpowers plugin** (for development methodology) and **beads** (for work tracking). They serve complementary purposes:

| Layer            | Tool               | Purpose                                         |
| ---------------- | ------------------ | ----------------------------------------------- |
| **What** to do   | Beads              | Track tasks, dependencies, status, history      |
| **How** to do it | Superpowers skills | TDD patterns, debugging approach, brainstorming |

## Key Integration Rules

1. **Beads supersedes TodoWrite**: Superpowers skills often suggest using `TodoWrite` for checklists. In this project, **use beads instead**. Create beads issues for checklist items rather than TodoWrite entries.

2. **Use skills for guidance**: Superpowers skills (e.g., `test-driven-development`, `systematic-debugging`, `brainstorming`) provide excellent methodology templates. Follow their approach while tracking work in beads.

3. **Mapping superpowers concepts to beads**:
   - Skill checklist item → Create a beads task
   - "Mark todo complete" → `bd close <id>`
   - Planning phase → Create beads epic with subtasks
   - Discovered work → `bd create` with `discovered-from` dependency

## Example Integration

When superpowers suggests:

```
1. [ ] Write failing test
2. [ ] Implement minimal code
3. [ ] Refactor
```

Do this instead:

```bash
bd create "Write failing test for X" -t task --deps parent-child:epic-123
bd create "Implement X" -t task --deps parent-child:epic-123
bd create "Refactor X" -t task --deps parent-child:epic-123
```

## Why This Works

- **Beads persists**: Work tracking survives across sessions (git-tracked JSONL)
- **Superpowers guides**: Skills provide proven patterns without reinventing workflows
- **Dependencies matter**: Beads tracks blockers; TodoWrite doesn't
- **Single source of truth**: All work lives in beads, methodology comes from skills

# IMPORTANT DATABASE USAGE WARNING

NEVER delete the prod or dev database for running tests, no matter what kind of tests. The dev and production databases are shared and used by multiple teams. If you delete the database, you will break the work of other teams.

Only use the commotion-test database for tests. Local, e2e, CI locally, doesn't matter NEVER ever delete commotion-prod or commotion-dev.

# Beads Workflow (IMPORTANT)

We are using bd (beads) for issue tracking. Use beads PROACTIVELY and SYSTEMATICALLY via the MCP tools.

## Workflow Overview

### Outer Loop (Epic Lifecycle)

1. **Pre-flight checks** when starting a new epic ("next epic", "next thing", ...):

   - Ensure you are on the `main` branch
   - Pull latest changes: `git pull origin main`
   - Verify no outstanding PRs exist before starting

2. **Create feature branch** from latest main:

   - Branch naming: `feature/<descriptive-name>` or `feature/<epic-id>`
   - Example: `git checkout -b feature/mentions-enhancement`

3. **Plan and create epic in beads** using `create` with `issue_type="epic"`. Only close the epic when the PR is merged.

4. **Enter inner loop** (see below)

5. **Verify all tests pass** - if not, go back to inner loop

6. **Submit PR for review**:

   - Push branch and create Pull Request
   - DO NOT merge - wait for user review and approval
   - Do not close the epic in beads until the PR is merged

7. **After user merges**:
   - Close the epic in beads before creating PR
   - Switch back to main: `git checkout main`
   - Pull latest: `git pull origin main`
   - Ready for next epic

### Inner Loop (Task Execution)

1. **Plan initial tasks** for the epic

   - Create a comprehensive and granular set of beads for all this with tasks, subtasks, and dependency structure overlaid, with detailed comments so that the whole thing is totally self-contained and self-documenting (including relevant background, reasoning/justification, considerations, etc.-- anything we'd want our "future self" to know about the goals and intentions and thought process and how it serves the overarching goals of the project.)"
   - Get alignment on the plan before implementation

2. **Track discovered work** - Create new tasks under the epic or existing tasks as needed.

   - Remember to always create comprehensive and granular sets of beads for all this with tasks, subtasks, and dependency structure overlaid, with detailed comments so that the whole thing is totally self-contained and self-documenting (including relevant background, reasoning/justification, considerations, etc.-- anything we'd want our "future self" to know about the goals and intentions and thought process and how it serves the overarching goals of the project.)"

3. **Do work and test**

   - After testing, give the user a chance to look at the changes
   - Commit incrementally as tasks complete if the users approval
   - Keep commits atomic and well-described

4. **Interact with user** for input and feedback

   - **Important**: All work is tracked in beads, even one-offs from chatting

5. **Repeat** until all tasks are complete and tests pass

## Branch Strategy

**One epic = One branch = One PR**

- All commits for the epic go on this branch
- Update beads issues as you complete tasks
- Verify all dependent tasks are closed before closing epic

## Dependencies (CRITICAL)

**Setting dependencies at creation (PREFERRED):**

- Use `deps=["issue-id1", "issue-id2"]` parameter when calling `create`
- Example: `create(title="...", deps=["epic-123", "task-456"])`
- This creates the dependency relationships immediately

**Adding dependencies after creation:**

- Use `dep(issue_id="task-1", depends_on_id="task-2", dep_type="blocks")`
- ONLY use this for adding NEW dependencies after task creation

**CRITICAL MISTAKE TO AVOID:**

- NEVER add the same dependency twice (once in `deps` parameter, then again with `dep` tool)
- This causes: `UNIQUE constraint failed: dependencies.issue_id, dependencies.depends_on_id`
- If you use `deps` at creation, don't call `dep` for the same relationship

**Dependency types:**

- `blocks`: Hard blocker (task B cannot start until task A completes)
- `related`: Soft link (tasks are related but not blocking)
- `parent-child`: Epic/subtask relationship
- `discovered-from`: Found this issue while working on another

**Viewing dependencies:**

- Use `show(issue_id="...")` to see both `dependencies` (what it depends on) and `dependents` (what depends on it)

## During Work (Track EVERYTHING in Beads)

1. Update status to `in_progress` before starting a task (use `update`)
2. Mark tasks `completed` immediately as you finish them (use `close`)
3. **Create new issues for ALL discovered work** - Bug fixes, iterations, refinements, quick fixes
4. Track blockers and dependencies as they emerge
5. **Even quick back-and-forth with user gets tracked** - Create issues for small fixes too

## Throughout

- Use dependencies to track relationships (`dep` with types: blocks, related, parent-child, discovered-from)
- Check for ready work with `ready`
- Keep issues updated with notes, design decisions, external refs
- Use `show` to review issue details and dependencies

## When Committing (CRITICAL)

Before committing code changes, ALWAYS:

1. **Run lint:fix** - Execute `bun run lint:fix` to auto-fix formatting issues before staging
2. **Review related beads issues** - Check if any issues were completed by your changes
3. **Close completed issues** - Use `close(issue_id="...", reason="...")` with meaningful completion notes
4. **Verify dependencies** - Check if closing an issue unblocks any dependent tasks
5. **Commit beads updates** - Always commit `.beads/issues.jsonl` changes along with code
6. **Final verification** - Run `list(status="open")` to ensure no orphaned open issues remain

**Why this matters:**

- Keeps issue tracking in sync with actual code state
- Prevents confusion about what's actually done
- Maintains accurate project status for the team
- Ensures beads reflects reality, not just intentions
- Please ask me to look at the changes before committing to git

````markdown
## UBS Quick Reference for AI Agents

UBS stands for "Ultimate Bug Scanner": **The AI Coding Agent's Secret Weapon: Flagging Likely Bugs for Fixing Early On**

**Install:** `curl -sSL https://raw.githubusercontent.com/Dicklesworthstone/ultimate_bug_scanner/main/install.sh | bash`

**Golden Rule:** `ubs <changed-files>` before every commit. Exit 0 = safe. Exit >0 = fix & re-run.

**Commands:**

```bash
ubs file.ts file2.py                    # Specific files (< 1s) — USE THIS
ubs $(git diff --name-only --cached)    # Staged files — before commit
ubs --only=js,python src/               # Language filter (3-5x faster)
ubs --ci --fail-on-warning .            # CI mode — before PR
ubs --help                              # Full command reference
ubs sessions --entries 1                # Tail the latest install session log
ubs .                                   # Whole project (ignores things like .venv and node_modules automatically)
```

**Output Format:**

```
⚠️  Category (N errors)
    file.ts:42:5 – Issue description
    💡 Suggested fix
Exit code: 1
```

Parse: `file:line:col` → location | 💡 → how to fix | Exit 0/1 → pass/fail

**Fix Workflow:**

1. Read finding → category + fix suggestion
2. Navigate `file:line:col` → view context
3. Verify real issue (not false positive)
4. Fix root cause (not symptom)
5. Re-run `ubs <file>` → exit 0
6. Commit

**Speed Critical:** Scope to changed files. `ubs src/file.ts` (< 1s) vs `ubs .` (30s). Never full scan for small edits.

**Bug Severity:**

- **Critical** (always fix): Null safety, XSS/injection, async/await, memory leaks
- **Important** (production): Type narrowing, division-by-zero, resource leaks
- **Contextual** (judgment): TODO/FIXME, console logs

**Anti-Patterns:**

- ❌ Ignore findings → ✅ Investigate each
- ❌ Full scan per edit → ✅ Scope to file
- ❌ Fix symptom (`if (x) { x.y }`) → ✅ Root cause (`x?.y`)
````
