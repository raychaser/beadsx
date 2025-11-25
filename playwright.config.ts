import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/extension.test.ts', // Only run Playwright tests, not test-cli suite
  testIgnore: '**/suite/**', // Exclude test-cli integration tests
  timeout: 60000,
  retries: 0,
  workers: 1, // Run tests sequentially for Electron
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
});
