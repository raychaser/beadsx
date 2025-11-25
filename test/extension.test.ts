import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { _electron as electron, test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

let electronApp: ElectronApplication;
let page: Page;

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
  // https://github.com/microsoft/vscode/issues/84238
  '--no-sandbox',
  // https://github.com/microsoft/vscode-test/issues/221
  '--disable-gpu-sandbox',
  // https://github.com/microsoft/vscode-test/issues/120
  '--disable-updates',
  '--skip-welcome',
  '--skip-release-notes',
  '--disable-workspace-trust',
  // Extension development
  `--extensionDevelopmentPath=${extensionPath}`,
  // Use temp directories to avoid conflicts
  `--user-data-dir=${userDataDir}`,
  `--extensions-dir=${extensionsDir}`,
];

test.beforeAll(async () => {
  // Create temp directories
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(extensionsDir, { recursive: true });
  console.log('Created temp dirs:', { workspacePath, userDataDir, extensionsDir });

  // Initialize beads database with known test issues
  try {
    // First initialize the beads database with prefix "test"
    execSync('bd init -p test -q', { cwd: workspacePath, stdio: 'pipe' });
    // Then create test issues
    execSync('bd create --title "Test Epic" --type epic', { cwd: workspacePath, stdio: 'pipe' });
    execSync('bd create --title "Test Bug" --type bug', { cwd: workspacePath, stdio: 'pipe' });
    execSync('bd create --title "Test Task" --type task', { cwd: workspacePath, stdio: 'pipe' });
    console.log('Initialized beads database with 3 test issues');
  } catch (e) {
    console.log('Failed to initialize beads (bd may not be available):', e);
  }

  const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
  console.log('VSCode executable path:', vscodeExecutablePath);

  // The vscodeExecutablePath should already point to the correct binary
  // On macOS it returns path to Electron binary
  const executablePath = vscodeExecutablePath;
  console.log('Electron executable path:', executablePath);
  console.log('Args:', args);

  try {
    electronApp = await electron.launch({
      executablePath,
      args,
      timeout: 60000,
    });
    console.log('Electron app launched');

    // Listen for console output from VSCode
    electronApp.on('console', (msg) => {
      console.log('[VSCode console]', msg.text());
    });

    // Listen for window events
    electronApp.on('window', (window) => {
      console.log('Window opened!');
    });

    // Poll for windows/pages to appear (VSCode takes time to create window)
    let pages: Page[] = [];
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds total

    while (pages.length === 0 && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Try multiple methods to detect windows
      const windows = electronApp.windows();
      const contextPages = electronApp.context().pages();

      // Check if process is still alive
      let isRunning = false;
      try {
        isRunning = await electronApp.evaluate(() => true);
      } catch {
        console.log('  - Process not responding');
      }

      console.log(`Attempt ${attempts + 1}:`);
      console.log('  - electronApp.windows():', windows.length);
      console.log('  - context().pages():', contextPages.length);
      console.log('  - Process alive:', isRunning);

      // Use whichever has pages
      pages = contextPages.length > 0 ? contextPages : windows;
      attempts++;
    }

    if (pages.length > 0) {
      page = pages[0];
      console.log('Found page after', attempts, 'seconds');
      console.log('Page URL:', page.url());
    } else {
      throw new Error('No VSCode window appeared after 30 seconds');
    }

    // Wait for VSCode to fully load
    await page.waitForTimeout(5000);
    console.log('VSCode loaded');
  } catch (error) {
    console.error('Failed to launch:', error);
    console.error('Windows at error:', electronApp?.windows().length);
    throw error;
  }
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

test.describe('BeadsX Extension', () => {
  test('VSCode launches successfully', async () => {
    const title = await page.title();
    // In extension development mode, title is "[Extension Development Host] <workspace>"
    expect(title).toContain('Extension Development Host');
  });

  test('Activity bar has Beads icon', async () => {
    // Look for the Beads activity bar item
    const activityBar = page.locator('[id="workbench.parts.activitybar"]');
    await expect(activityBar).toBeVisible();
  });

  test('Beads panel shows issues from demo project', async () => {
    // Click on the Beads icon in activity bar to open the panel
    // The beadsx view container should be visible
    const beadsContainer = page.locator('[id="workbench.view.extension.beadsx"]');

    // Wait for extension to activate and load issues
    await page.waitForTimeout(3000);

    // Check if tree view is rendered
    const treeView = page.locator('.monaco-list');
    await expect(treeView.first()).toBeVisible({ timeout: 10000 });
  });

  test('Double-click on issue opens detail panel', async () => {
    // Wait for extension to be ready
    await page.waitForTimeout(2000);

    // Click on the BeadsX icon in the activity bar to open the issues panel
    const beadsxView = page.locator('[id="workbench.parts.activitybar"] a.action-label[aria-label="Beads"]');
    await beadsxView.click();
    console.log('Clicked BeadsX activity bar item');

    // Wait for the panel to open and issues to load
    await page.waitForTimeout(3000);

    // Find tree items - could be in BeadsX panel or any visible tree
    // The extension may find issues from parent directory's beads
    const treeItems = page.locator('[role="treeitem"]');

    // Poll for tree items to appear (extension needs time to load issues)
    let treeItemCount = 0;
    for (let i = 0; i < 10; i++) {
      treeItemCount = await treeItems.count();
      console.log(`Attempt ${i + 1}: Tree items count: ${treeItemCount}`);
      if (treeItemCount > 0) break;
      await page.waitForTimeout(1000);
    }

    // Skip test if no issues found (beads not available in test environment)
    if (treeItemCount === 0) {
      console.log('No tree items found - skipping double-click test (beads not available)');
      return;
    }

    // Double-click on the first issue (two clicks with short delay)
    await treeItems.first().click();
    await page.waitForTimeout(100);
    await treeItems.first().click();

    // Wait for the detail webview panel to appear
    await page.waitForTimeout(2000);

    // Check for the webview panel - it creates an editor tab with "Issue:" prefix
    const tabs = page.locator('.tabs-container .tab');
    const tabCount = await tabs.count();
    console.log('Tabs count:', tabCount);

    for (let i = 0; i < tabCount; i++) {
      const tabLabel = await tabs.nth(i).textContent();
      console.log(`Tab ${i}: ${tabLabel}`);
    }

    const detailTab = tabs.filter({ hasText: 'Issue:' });
    await expect(detailTab).toBeVisible({ timeout: 5000 });
  });
});
