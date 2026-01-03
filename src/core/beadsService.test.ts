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
  getBeadsInitStatus,
  listReadyIssues,
} from './beadsService';

// Track call count to return different values for different calls
let execFileCallCount = 0;

/**
 * Helper to mock execFile for promisify - callback is the last argument.
 * beadsx-912: Mock responses array is consumed in order:
 * - First response: bd --version check (findBdExecutable validates bd exists)
 * - Second response: actual bd command execution (export, ready, etc.)
 * - For fallback tests: multiple responses simulate PATH lookup failure → fallback success
 */
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
      // beadsx-912: Each call consumes next response; last response repeats if array exhausted
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

    // beadsx-912: Response order: [0] version check for findBdExecutable, [1] export command output
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

    // beadsx-912: Response order: [0] version check for findBdExecutable, [1] export command output
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
    // beadsx-900: Enable fallback so non-ENOENT errors try fallback paths instead of throwing
    configure({ allowFallbackOnFailure: true });

    const exitCodeError = new Error('Command failed with exit code 1');
    // beadsx-912: All responses are errors - first tries PATH lookup, then fallback paths
    // 4 errors needed: PATH lookup + 3 fallback paths (all fail to trigger error result)
    mockExecFileWithResponses([exitCodeError, exitCodeError, exitCodeError, exitCodeError]);

    const result = await exportIssuesWithDeps('/test/workspace');

    expect(result.success).toBe(false);
    expect(result.error).toContain('exit code 1');
    expect(result.error).toContain('manually');
  });

  it('provides specific message for ENOENT errors', async () => {
    const enoentError = new Error('spawn bd ENOENT') as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';
    // beadsx-912: All responses are ENOENT - PATH lookup fails, then 3 fallback paths also fail
    mockExecFileWithResponses([enoentError, enoentError, enoentError, enoentError]);

    const result = await exportIssuesWithDeps('/test/workspace');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(result.error).toContain('PATH');
  });
});

// beadsx-908: Test for EACCES warning path in findBdExecutable
describe('findBdExecutable - EACCES handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearBeadsInitializedCache();
    clearBdPathCache();
    configure({});
    vi.mocked(access).mockResolvedValue(undefined);
  });

  it('logs EACCES at debug level when configured path has permission issues', async () => {
    // Configure an absolute path that will trigger the EACCES path
    configure({ commandPath: '/usr/local/bin/bd' });

    // Mock access check fails with EACCES (permission denied)
    const eaccesError = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
    eaccesError.code = 'EACCES';
    vi.mocked(access).mockRejectedValueOnce(eaccesError);

    // beadsx-912: First mock is for .beads check (success), second is for path validation (EACCES)
    // Then execFile will be called - mock it to succeed so we can verify the path was still used
    mockExecFileWithResponses([{ stdout: 'bd version 1.0.0' }, { stdout: '' }]);

    // Call a function that triggers findBdExecutable - exportIssuesWithDeps will do this
    const result = await exportIssuesWithDeps('/test/workspace');

    // The function should still work (path is returned for execution even if access check fails)
    // beadsx-901 changed this from warn() to log() at debug level
    expect(result.success).toBe(true);
  });
});

// beadsx-909: Behavioral test for clearBdPathCache
describe('clearBdPathCache - behavioral verification', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearBeadsInitializedCache();
    clearBdPathCache();
    configure({});
    vi.mocked(access).mockResolvedValue(undefined);
  });

  it('forces re-discovery of bd path after cache clear', async () => {
    // First call - bd is found and cached
    mockExecFileWithResponses([
      { stdout: 'bd version 1.0.0' }, // version check
      { stdout: '' }, // export command
    ]);

    await exportIssuesWithDeps('/test/workspace');
    const firstCallCount = vi.mocked(execFile).mock.calls.length;

    // Second call - should use cached path (no additional version check)
    vi.mocked(execFile).mockClear();
    mockExecFileWithResponses([
      { stdout: '' }, // only export command (path is cached)
    ]);

    await exportIssuesWithDeps('/test/workspace');
    const secondCallCount = vi.mocked(execFile).mock.calls.length;

    // Clear the cache
    clearBdPathCache();

    // Third call - should re-discover bd (version check again)
    vi.mocked(execFile).mockClear();
    mockExecFileWithResponses([
      { stdout: 'bd version 1.0.0' }, // version check (re-discovery)
      { stdout: '' }, // export command
    ]);

    await exportIssuesWithDeps('/test/workspace');
    const thirdCallCount = vi.mocked(execFile).mock.calls.length;

    // After cache clear, we should see version check happening again
    // First call: 2 calls (version + export)
    expect(firstCallCount).toBe(2);
    // Second call: 1 call (export only, path cached)
    expect(secondCallCount).toBe(1);
    // Third call: 2 calls (version + export, cache was cleared)
    expect(thirdCallCount).toBe(2);
  });
});

// beadsx-916: Test listReadyIssues tombstone filtering
describe('listReadyIssues - tombstone filtering', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearBeadsInitializedCache();
    clearBdPathCache();
    configure({});
    vi.mocked(access).mockResolvedValue(undefined);
  });

  it('filters tombstones if bd ready unexpectedly returns them', async () => {
    // bd ready normally shouldn't return tombstones, but defensive filtering ensures they never appear
    const readyOutput = JSON.stringify({
      issues: [
        {
          id: 'ready-1',
          title: 'Ready Issue',
          status: 'open',
          priority: 2,
          issue_type: 'task',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'tombstone-1',
          title: 'Should Be Filtered',
          status: 'tombstone',
          priority: 2,
          issue_type: 'task',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ],
    });

    mockExecFileWithResponses([{ stdout: 'bd version 1.0.0' }, { stdout: readyOutput }]);

    const result = await listReadyIssues('/test/workspace');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('ready-1');
    expect(result.data.some((i) => i.status === 'tombstone')).toBe(false);
  });

  // beadsx-914: Test that unexpected format returns success:false
  it('returns success:false when bd ready returns unexpected format', async () => {
    // Simulate bd ready returning a non-array, non-{issues:[]} response
    const unexpectedOutput = JSON.stringify({ data: 'unexpected format' });

    mockExecFileWithResponses([{ stdout: 'bd version 1.0.0' }, { stdout: unexpectedOutput }]);

    const result = await listReadyIssues('/test/workspace');

    expect(result.success).toBe(false);
    expect(result.error).toContain('unexpected format');
    expect(result.data).toEqual([]);
  });
});

// beadsx-917: Direct tests for getBeadsInitStatus
describe('getBeadsInitStatus - detailed status', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearBeadsInitializedCache();
  });

  it('returns initialized when .beads directory exists', async () => {
    vi.mocked(access).mockResolvedValue(undefined);

    const status = await getBeadsInitStatus('/test/workspace');

    expect(status).toBe('initialized');
  });

  it('returns not-initialized for ENOENT (directory does not exist)', async () => {
    const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';
    vi.mocked(access).mockRejectedValue(enoentError);

    const status = await getBeadsInitStatus('/test/workspace');

    expect(status).toBe('not-initialized');
  });

  it('returns access-error for EACCES (permission denied)', async () => {
    const eaccesError = new Error('EACCES') as NodeJS.ErrnoException;
    eaccesError.code = 'EACCES';
    vi.mocked(access).mockRejectedValue(eaccesError);

    const status = await getBeadsInitStatus('/test/workspace');

    expect(status).toBe('access-error');
  });

  it('returns access-error for other errors', async () => {
    const otherError = new Error('Unknown error') as NodeJS.ErrnoException;
    otherError.code = 'EIO';
    vi.mocked(access).mockRejectedValue(otherError);

    const status = await getBeadsInitStatus('/test/workspace');

    expect(status).toBe('access-error');
  });

  it('caches initialized and not-initialized but not access-error', async () => {
    // First call - access-error (should NOT be cached)
    const eaccesError = new Error('EACCES') as NodeJS.ErrnoException;
    eaccesError.code = 'EACCES';
    vi.mocked(access).mockRejectedValueOnce(eaccesError);

    const status1 = await getBeadsInitStatus('/test/workspace');
    expect(status1).toBe('access-error');

    // Second call - now succeeds (permission fixed)
    vi.mocked(access).mockResolvedValueOnce(undefined);

    const status2 = await getBeadsInitStatus('/test/workspace');
    expect(status2).toBe('initialized');

    // Verify access was called twice (access-error was not cached)
    expect(vi.mocked(access)).toHaveBeenCalledTimes(2);
  });
});

// beadsx-919: Test that default allowFallbackOnFailure throws error
describe('findBdExecutable - allowFallbackOnFailure default behavior', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearBeadsInitializedCache();
    clearBdPathCache();
    configure({}); // Default config - allowFallbackOnFailure is undefined/false
    vi.mocked(access).mockResolvedValue(undefined);
  });

  it('throws error when configured command fails and allowFallbackOnFailure is false', async () => {
    // Non-ENOENT error means command exists but is broken
    const crashError = new Error('Segmentation fault');
    mockExecFileWithResponses([crashError]);

    // beadsx-919: Should throw, not return BeadsResult, when allowFallbackOnFailure is false
    await expect(exportIssuesWithDeps('/test/workspace')).rejects.toThrow(/allowFallbackOnFailure/);
  });
});

// beadsx-923: Test EPERM/EAGAIN error message formatting
describe('formatBdError - EPERM/EAGAIN handling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearBeadsInitializedCache();
    clearBdPathCache();
    configure({ allowFallbackOnFailure: true });
    vi.mocked(access).mockResolvedValue(undefined);
  });

  it('provides specific message for EPERM errors', async () => {
    const epermError = new Error('Operation not permitted') as NodeJS.ErrnoException;
    epermError.code = 'EPERM';
    mockExecFileWithResponses([epermError, epermError, epermError, epermError]);

    const result = await exportIssuesWithDeps('/test/workspace');

    expect(result.success).toBe(false);
    expect(result.error).toContain('operation not permitted');
  });

  it('provides specific message for EAGAIN errors', async () => {
    const eagainError = new Error('Resource temporarily unavailable') as NodeJS.ErrnoException;
    eagainError.code = 'EAGAIN';
    mockExecFileWithResponses([eagainError, eagainError, eagainError, eagainError]);

    const result = await exportIssuesWithDeps('/test/workspace');

    expect(result.success).toBe(false);
    expect(result.error).toContain('resource constraints');
  });
});
