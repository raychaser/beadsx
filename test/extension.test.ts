import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication, Locator, Page } from '@playwright/test';
import { _electron as electron, expect, test } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

// ============================================
// Test Data Types
// ============================================

interface TestIssue {
  id: string;
  title: string;
  type: 'epic' | 'bug' | 'task';
  description?: string;
}

// ============================================
// Shared State
// ============================================

let electronApp: ElectronApplication;
let page: Page;
let testIssues: { epic: TestIssue; bug: TestIssue; task: TestIssue };

// Get the project root directory
const projectRoot = path.resolve(process.cwd());
const extensionPath = projectRoot;

// Create temp directories completely outside the project tree
// This prevents bd from walking up and finding the main project's .beads database
const tmpDir = path.join(os.tmpdir(), `beadsx-test-${Date.now()}`);
const workspacePath = path.join(tmpDir, 'workspace');
const userDataDir = path.join(tmpDir, 'user-data');
const extensionsDir = path.join(tmpDir, 'extensions');

// VSCode needs these arguments to run properly (from @vscode/test-electron)
const args = [
  workspacePath,
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--disable-updates',
  '--skip-welcome',
  '--skip-release-notes',
  '--disable-workspace-trust',
  `--extensionDevelopmentPath=${extensionPath}`,
  `--user-data-dir=${userDataDir}`,
  `--extensions-dir=${extensionsDir}`,
];

// ============================================
// Helper Functions - Issue Creation
// ============================================

/**
 * Creates a beads issue and captures the returned ID
 */
function createIssueAndCaptureId(
  cwd: string,
  opts: { title: string; type: string; description?: string },
): string {
  let cmd = `bd create --title "${opts.title}" --type ${opts.type}`;
  if (opts.description) {
    cmd += ` --description "${opts.description}"`;
  }

  const output = execSync(cmd, { cwd, encoding: 'utf8' });
  const match = output.match(/Created issue: ([\w-]+)/);
  if (!match) {
    throw new Error(`Failed to parse issue ID from: ${output}`);
  }
  return match[1];
}

// ============================================
// Helper Functions - Selectors (Scoped to BeadsX)
// ============================================

/**
 * Get tree items ONLY within BeadsX panel (not explorer, search, etc.)
 */
function getBeadsXTreeItems(p: Page): Locator {
  return p.locator('[id="workbench.view.extension.beadsx"] [role="treeitem"]');
}

/**
 * Get BeadsX activity bar button
 */
function getBeadsXActivityBar(p: Page): Locator {
  return p.locator('[id="workbench.parts.activitybar"] a.action-label[aria-label="Beads"]');
}

/**
 * Get a specific issue by its title text
 */
function getIssueByTitle(p: Page, title: string): Locator {
  return getBeadsXTreeItems(p).filter({ hasText: title });
}

/**
 * Get a specific issue by its ID
 */
function getIssueById(p: Page, id: string): Locator {
  return getBeadsXTreeItems(p).filter({ hasText: id });
}

/**
 * Get the detail panel tab
 */
function getDetailPanelTab(p: Page): Locator {
  return p.locator('.tabs-container .tab').filter({ hasText: 'Issue:' });
}

// ============================================
// Helper Functions - Actions
// ============================================

/**
 * Open the BeadsX panel by clicking the activity bar icon
 */
async function openBeadsXPanel(p: Page): Promise<void> {
  const button = getBeadsXActivityBar(p);
  await button.click();
  // Wait for tree items to be visible
  await getBeadsXTreeItems(p).first().waitFor({ state: 'visible', timeout: 15000 });
}

/**
 * Open issue detail panel by double-clicking
 */
async function openIssueDetail(p: Page, issueLocator: Locator): Promise<void> {
  await issueLocator.dblclick();
  await getDetailPanelTab(p).waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Execute command via Command Palette and wait for it to complete
 */
async function executeCommand(p: Page, commandName: string): Promise<void> {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await p.keyboard.press(`${modifier}+Shift+P`);
  // Wait for command palette to open
  await p.locator('.quick-input-widget').waitFor({ state: 'visible', timeout: 5000 });
  await p.keyboard.type(commandName);
  await p.waitForTimeout(300); // Let search complete
  await p.keyboard.press('Enter');
  // For commands that show a quick pick, wait for the NEW quick pick
  // The command palette closes and a new one opens
  await p.waitForTimeout(500);
}

/**
 * Execute BeadsX Filter command and wait for filter quick pick
 */
async function executeFilterCommand(p: Page): Promise<void> {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await p.keyboard.press(`${modifier}+Shift+P`);
  await p.locator('.quick-input-widget').waitFor({ state: 'visible', timeout: 5000 });
  await p.keyboard.type('Filter Issues');

  // Wait for command to appear in list before pressing Enter
  await p
    .locator('.quick-input-list-row')
    .filter({ hasText: 'Filter Issues' })
    .waitFor({ state: 'visible', timeout: 5000 });

  await p.keyboard.press('Enter');

  // Wait for filter quick pick to appear (command palette closes, filter picker opens)
  // Poll for the filter options to appear with increased timeout
  await p
    .locator('.quick-input-list-row')
    .filter({ hasText: 'All Issues' })
    .waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Refresh BeadsX panel via command and wait for data to reload
 */
async function refreshBeadsXPanel(p: Page): Promise<void> {
  await executeCommand(p, 'BeadsX: Refresh Issues');
  // Wait for tree to refresh - the command triggers a reload
  await p.waitForTimeout(3000);
}

// ============================================
// Test Setup and Teardown
// ============================================

test.beforeAll(async () => {
  // Create temp directories
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(extensionsDir, { recursive: true });
  console.log('Created temp dirs:', { workspacePath, userDataDir, extensionsDir });

  // Initialize beads database with known test issues and capture IDs
  try {
    execSync('bd init -p test -q', { cwd: workspacePath, stdio: 'pipe' });

    testIssues = {
      epic: {
        id: createIssueAndCaptureId(workspacePath, {
          title: 'Test Epic',
          type: 'epic',
          description: 'This is the epic description for testing',
        }),
        title: 'Test Epic',
        type: 'epic',
        description: 'This is the epic description for testing',
      },
      bug: {
        id: createIssueAndCaptureId(workspacePath, {
          title: 'Test Bug',
          type: 'bug',
        }),
        title: 'Test Bug',
        type: 'bug',
      },
      task: {
        id: createIssueAndCaptureId(workspacePath, {
          title: 'Test Task',
          type: 'task',
        }),
        title: 'Test Task',
        type: 'task',
      },
    };

    console.log('Created test issues:', JSON.stringify(testIssues, null, 2));
  } catch (e) {
    console.log('Failed to initialize beads (bd may not be available):', e);
    throw e;
  }

  const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
  console.log('VSCode executable path:', vscodeExecutablePath);

  electronApp = await electron.launch({
    executablePath: vscodeExecutablePath,
    args,
    timeout: 60000,
  });
  console.log('Electron app launched');

  // Use Playwright's firstWindow() instead of manual polling
  page = await electronApp.firstWindow({ timeout: 30000 });
  console.log('Got first window');

  // Wait for VSCode to fully load (semantic wait)
  await page
    .locator('[id="workbench.parts.statusbar"]')
    .waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => document.title.includes('Extension Development Host'), {
    timeout: 30000,
  });
  console.log('VSCode loaded');
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
  // Cleanup temp directories
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('Cleaned up temp dir:', tmpDir);
  } catch (e) {
    console.log('Failed to cleanup temp dir:', e);
  }
});

// ============================================
// All Tests in Single describe Block
// ============================================

test.describe('BeadsX Extension', () => {
  // Open panel once and keep it open
  test.beforeAll(async () => {
    await openBeadsXPanel(page);
  });

  // Core tests
  test('VSCode launches successfully', async () => {
    const title = await page.title();
    expect(title).toContain('Extension Development Host');
  });

  test('Activity bar has Beads icon', async () => {
    const button = getBeadsXActivityBar(page);
    await expect(button).toBeVisible();
  });

  // Tree View Data tests
  test('Tree: displays exactly 3 test issues', async () => {
    const treeItems = getBeadsXTreeItems(page);
    await expect(treeItems).toHaveCount(3);
  });

  test('Tree: displays known issue IDs', async () => {
    await expect(getIssueById(page, testIssues.epic.id)).toBeVisible();
    await expect(getIssueById(page, testIssues.bug.id)).toBeVisible();
    await expect(getIssueById(page, testIssues.task.id)).toBeVisible();
  });

  test('Tree: displays correct issue titles', async () => {
    await expect(getIssueByTitle(page, 'Test Epic')).toBeVisible();
    await expect(getIssueByTitle(page, 'Test Bug')).toBeVisible();
    await expect(getIssueByTitle(page, 'Test Task')).toBeVisible();
  });

  test('Tree: shows open status symbol [O] for all issues', async () => {
    const treeItems = getBeadsXTreeItems(page);
    const count = await treeItems.count();

    for (let i = 0; i < count; i++) {
      const text = await treeItems.nth(i).textContent();
      expect(text).toContain('[O]');
    }
  });

  // Detail Panel tests
  test('Detail: double-click opens detail panel with correct ID', async () => {
    const epicIssue = getIssueById(page, testIssues.epic.id);
    await openIssueDetail(page, epicIssue);

    // Verify tab exists and contains the issue ID
    const detailTab = getDetailPanelTab(page);
    await expect(detailTab).toBeVisible();
    await expect(detailTab).toContainText(testIssues.epic.id);
  });

  test('Detail: can open different issue types', async () => {
    // Close any existing detail tabs by pressing Cmd+W
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+W`);
    await page.waitForTimeout(500);

    // Open bug issue detail
    const bugIssue = getIssueById(page, testIssues.bug.id);
    await bugIssue.dblclick();
    await page.waitForTimeout(500); // Wait for double-click detection to pass

    // Tab should show bug issue ID
    let detailTab = page.locator('.tabs-container .tab').filter({ hasText: testIssues.bug.id });
    await expect(detailTab).toBeVisible({ timeout: 5000 });

    // Open task issue detail - wait to avoid debounce
    await page.waitForTimeout(400); // Must exceed 300ms debounce
    const taskIssue = getIssueById(page, testIssues.task.id);
    await taskIssue.dblclick();
    await page.waitForTimeout(500);

    // Tab should show task issue ID
    detailTab = page.locator('.tabs-container .tab').filter({ hasText: testIssues.task.id });
    await expect(detailTab).toBeVisible({ timeout: 5000 });
  });

  // Filter tests
  test('Filter: quick pick shows all options', async () => {
    await executeFilterCommand(page);

    const quickPick = page.locator('.quick-input-widget');
    await expect(quickPick).toBeVisible({ timeout: 5000 });

    await expect(
      page.locator('.quick-input-list-row').filter({ hasText: 'All Issues' }),
    ).toBeVisible();
    await expect(
      page.locator('.quick-input-list-row').filter({ hasText: 'Open Issues' }),
    ).toBeVisible();
    await expect(
      page.locator('.quick-input-list-row').filter({ hasText: 'Ready Issues' }),
    ).toBeVisible();
    await expect(
      page.locator('.quick-input-list-row').filter({ hasText: 'Recent Issues' }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('Filter: Open filter hides closed issues', async () => {
    // First verify we have 3 issues
    await expect(getBeadsXTreeItems(page)).toHaveCount(3);

    // Close one issue externally
    execSync(`bd close ${testIssues.task.id} --reason "testing filter"`, {
      cwd: workspacePath,
      stdio: 'pipe',
    });

    // Refresh to pick up the external status change
    await refreshBeadsXPanel(page);

    // Apply Open filter
    await executeFilterCommand(page);
    await page.locator('.quick-input-list-row').filter({ hasText: 'Open Issues' }).click();
    await page.waitForTimeout(2000);

    // Should now show only 2 issues (closed one filtered out)
    await expect(getBeadsXTreeItems(page)).toHaveCount(2);

    // Reopen the issue for other tests
    execSync(`bd update ${testIssues.task.id} --status open`, {
      cwd: workspacePath,
      stdio: 'pipe',
    });

    // Reset to All filter
    await executeFilterCommand(page);
    await page.locator('.quick-input-list-row').filter({ hasText: 'All Issues' }).click();
    await page.waitForTimeout(2000);
  });

  test('Filter: Ready filter shows only unblocked issues', async () => {
    // Create a blocking dependency: bug is blocked by epic
    execSync(`bd dep add ${testIssues.bug.id} ${testIssues.epic.id} --type blocks`, {
      cwd: workspacePath,
      stdio: 'pipe',
    });

    // Refresh to pick up the external dependency change
    await refreshBeadsXPanel(page);

    // Apply Ready filter
    await executeFilterCommand(page);
    await page.locator('.quick-input-list-row').filter({ hasText: 'Ready Issues' }).click();

    // Wait for tree to show only 2 items (epic and task, but not bug)
    await expect(getBeadsXTreeItems(page)).toHaveCount(2, { timeout: 15000 });

    // Verify bug is not visible and epic/task are
    await expect(getIssueById(page, testIssues.bug.id)).not.toBeVisible();
    await expect(getIssueById(page, testIssues.epic.id)).toBeVisible();
    await expect(getIssueById(page, testIssues.task.id)).toBeVisible();

    // Reset to All filter
    await executeFilterCommand(page);
    await page.locator('.quick-input-list-row').filter({ hasText: 'All Issues' }).click();
    await page.waitForTimeout(2000);
  });

  test('Filter: Recent filter shows open and recently closed issues', async () => {
    // Verify we start with 3 open issues
    await expect(getBeadsXTreeItems(page)).toHaveCount(3, { timeout: 10000 });

    // Close an issue
    execSync(`bd close ${testIssues.task.id} --reason "testing recent filter"`, {
      cwd: workspacePath,
      stdio: 'pipe',
    });

    // Refresh to pick up the status change
    await refreshBeadsXPanel(page);

    // Apply Recent filter
    await executeFilterCommand(page);
    await expect(
      page.locator('.quick-input-list-row').filter({ hasText: 'Recent Issues' }),
    ).toBeVisible();
    await page.locator('.quick-input-list-row').filter({ hasText: 'Recent Issues' }).click();
    await page.waitForTimeout(2000);

    // Recently closed issue should still be visible (closed within 1 hour default window)
    await expect(getBeadsXTreeItems(page)).toHaveCount(3, { timeout: 10000 });
    await expect(getIssueById(page, testIssues.task.id)).toBeVisible();

    // Reopen the issue for other tests
    execSync(`bd update ${testIssues.task.id} --status open`, {
      cwd: workspacePath,
      stdio: 'pipe',
    });

    // Reset to All filter
    await executeFilterCommand(page);
    await page.locator('.quick-input-list-row').filter({ hasText: 'All Issues' }).click();
    await page.waitForTimeout(2000);
  });

  // Refresh tests
  test('Refresh: picks up externally added issues', async () => {
    // Ensure we're on All filter and have 3 base issues
    await expect(getBeadsXTreeItems(page)).toHaveCount(3, { timeout: 10000 });
    const initialCount = await getBeadsXTreeItems(page).count();

    // Add a new issue externally via bd CLI
    execSync('bd create --title "Externally Added" --type task', {
      cwd: workspacePath,
      stdio: 'pipe',
    });

    // Refresh the panel
    await refreshBeadsXPanel(page);

    // Should now show one more issue
    await expect(getBeadsXTreeItems(page)).toHaveCount(initialCount + 1, { timeout: 10000 });

    // Verify the new issue appears
    await expect(getIssueByTitle(page, 'Externally Added')).toBeVisible({ timeout: 5000 });
  });

  test('Refresh: updates changed issue status', async () => {
    // Find epic issue and verify it shows [O]
    const epicItem = getIssueById(page, testIssues.epic.id);
    await expect(epicItem).toContainText('[O]');

    // Close the issue externally
    execSync(`bd close ${testIssues.epic.id} --reason "testing refresh"`, {
      cwd: workspacePath,
      stdio: 'pipe',
    });

    // Refresh
    await refreshBeadsXPanel(page);

    // Now should show [C] for closed - use Playwright's auto-retry
    await expect(epicItem).toContainText('[C]', { timeout: 10000 });

    // Reopen for other tests
    execSync(`bd update ${testIssues.epic.id} --status open`, {
      cwd: workspacePath,
      stdio: 'pipe',
    });
    await refreshBeadsXPanel(page);
  });
});
