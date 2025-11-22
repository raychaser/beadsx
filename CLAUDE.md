Please see AGENTS.md for the project's issue tracking system.

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

3. **Create epic in beads** using `create` with `issue_type="epic"`

4. **Enter inner loop** (see below)

5. **Verify all tests pass** - if not, go back to inner loop

6. **Submit PR for review**:
   - Close the epic in beads before creating PR
   - Push branch and create Pull Request
   - DO NOT merge - wait for user review and approval

7. **After user merges**:
   - Switch back to main: `git checkout main`
   - Pull latest: `git pull origin main`
   - Ready for next epic

### Inner Loop (Task Execution)

1. **Plan initial tasks** for the epic
   - Use beads dependency tracking for structuring tasks
   - Get alignment on the plan before implementation

2. **Do work and test**
   - Commit incrementally as tasks complete
   - Keep commits atomic and well-described

3. **Track discovered work** - Create new tasks under the epic or existing tasks as needed

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

Before committing code changes, ALWAYS sync beads with completed work:

1. **Review related beads issues** - Check if any issues were completed by your changes
2. **Close completed issues** - Use `close(issue_id="...", reason="...")` with meaningful completion notes
3. **Verify dependencies** - Check if closing an issue unblocks any dependent tasks
4. **Commit beads updates** - Always commit `.beads/issues.jsonl` changes along with code
5. **Final verification** - Run `list(status="open")` to ensure no orphaned open issues remain

**Why this matters:**
- Keeps issue tracking in sync with actual code state
- Prevents confusion about what's actually done
- Maintains accurate project status for the team
- Ensures beads reflects reality, not just intentions
