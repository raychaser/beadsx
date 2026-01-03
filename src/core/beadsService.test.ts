// Tests for core beadsService - tombstone filtering and error handling
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock child_process before importing beadsService
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock fs/promises before importing beadsService
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  constants: { X_OK: 1 },
}));

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import {
  clearBdPathCache,
  clearBeadsInitializedCache,
  configure,
  exportIssuesWithDeps,
} from './beadsService';

// Track call count to return different values for different calls
let execFileCallCount = 0;

// Helper to mock execFile for promisify - callback is the last argument
function mockExecFileWithResponses(
  responses: Array<{ stdout: string; stderr?: string } | Error>,
): void {
  execFileCallCount = 0;
  vi.mocked(execFile).mockImplementation(
    // @ts-expect-error - simplified mock for testing callback-style API used by promisify
    (
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const response = responses[execFileCallCount] || responses[responses.length - 1];
      execFileCallCount++;

      if (response instanceof Error) {
        process.nextTick(() => callback(response, '', ''));
        return { stdout: '', stderr: '' };
      }
      process.nextTick(() => callback(null, response.stdout, response.stderr || ''));
      return { stdout: response.stdout, stderr: response.stderr || '' };
    },
  );
}

describe('exportIssuesWithDeps - tombstone filtering', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearBeadsInitializedCache();
    clearBdPathCache();
    configure({});

    // Mock .beads directory exists
    vi.mocked(access).mockResolvedValue(undefined);
  });

  it('returns empty array when all issues are tombstones', async () => {
    // This test verifies the core tombstone filtering logic works
    // Note: The bd path is cached after the --version check, subsequent tests
    // in this describe block inherit that cached value
    const jsonlOutput = [
      '{"id":"issue-1","title":"Tombstone 1","status":"tombstone","priority":2,"issue_type":"task","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z"}',
      '{"id":"issue-2","title":"Tombstone 2","status":"tombstone","priority":2,"issue_type":"task","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z"}',
    ].join('\n');

    mockExecFileWithResponses([{ stdout: 'bd version 1.0.0' }, { stdout: jsonlOutput }]);

    const result = await exportIssuesWithDeps('/test/workspace');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
    // Verify all tombstones were filtered out
    expect(result.data.some((i) => i.status === 'tombstone')).toBe(false);
  });
});

describe('formatBdError - exit code handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearBeadsInitializedCache();
    clearBdPathCache();
    configure({});

    // Mock .beads directory exists
    vi.mocked(access).mockResolvedValue(undefined);
  });

  it('provides actionable message for non-zero exit codes', async () => {
    const exitCodeError = new Error('Command failed with exit code 1');
    mockExecFileWithResponses([exitCodeError, exitCodeError, exitCodeError, exitCodeError]);

    const result = await exportIssuesWithDeps('/test/workspace');

    expect(result.success).toBe(false);
    expect(result.error).toContain('exit code 1');
    expect(result.error).toContain('manually');
  });

  it('provides specific message for ENOENT errors', async () => {
    const enoentError = new Error('spawn bd ENOENT') as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';
    mockExecFileWithResponses([enoentError, enoentError, enoentError, enoentError]);

    const result = await exportIssuesWithDeps('/test/workspace');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('PATH');
  });
});
