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
      callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void,
    ) => {
      const response = responses[execFileCallCount] || responses[responses.length - 1];
      execFileCallCount++;

      if (response instanceof Error) {
        process.nextTick(() => callback(response));
        return;
      }
      // promisify expects callback(null, result) where result has stdout/stderr
      process.nextTick(() =>
        callback(null, { stdout: response.stdout, stderr: response.stderr || '' }),
      );
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

  it('filters tombstones while preserving active issues', async () => {
    // This test verifies filtering works correctly with mixed issue statuses
    const jsonlOutput = [
      '{"id":"active-1","title":"Active Open Issue","status":"open","priority":2,"issue_type":"task","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z"}',
      '{"id":"tombstone-1","title":"Deleted Issue","status":"tombstone","priority":2,"issue_type":"task","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z"}',
      '{"id":"active-2","title":"Closed Issue","status":"closed","priority":2,"issue_type":"task","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z","closed_at":"2025-01-02T00:00:00Z"}',
      '{"id":"tombstone-2","title":"Another Deleted","status":"tombstone","priority":2,"issue_type":"task","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z"}',
      '{"id":"active-3","title":"In Progress Issue","status":"in_progress","priority":1,"issue_type":"bug","created_at":"2025-01-01T00:00:00Z","updated_at":"2025-01-01T00:00:00Z"}',
    ].join('\n');

    // beforeEach clears all caches, so we need both version check and export responses
    mockExecFileWithResponses([{ stdout: 'bd version 1.0.0' }, { stdout: jsonlOutput }]);

    const result = await exportIssuesWithDeps('/test/workspace');

    expect(result.success).toBe(true);
    // Should have 3 active issues, 2 tombstones filtered out
    expect(result.data).toHaveLength(3);
    // Verify no tombstones in result
    expect(result.data.some((i) => i.status === 'tombstone')).toBe(false);
    // Verify correct issues are present
    expect(result.data.map((i) => i.id).sort()).toEqual(['active-1', 'active-2', 'active-3']);
    // Verify statuses are preserved correctly
    expect(result.data.find((i) => i.id === 'active-1')?.status).toBe('open');
    expect(result.data.find((i) => i.id === 'active-2')?.status).toBe('closed');
    expect(result.data.find((i) => i.id === 'active-3')?.status).toBe('in_progress');
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
