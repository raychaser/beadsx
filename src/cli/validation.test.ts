// Tests for CLI validation utilities
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}));

// Mock ../core
vi.mock('../core', () => ({
  isBeadsInitialized: vi.fn(),
}));

import { stat } from 'node:fs/promises';
import { isBeadsInitialized } from '../core';
import { validateBeadsInitialized, validateWorkspace } from './validation';

describe('validateWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid for existing directory', async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => true,
    } as ReturnType<typeof stat> extends Promise<infer T> ? T : never);

    const result = await validateWorkspace('/valid/path');
    expect(result).toEqual({ valid: true });
  });

  it('returns error when path is not a directory', async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => false,
    } as ReturnType<typeof stat> extends Promise<infer T> ? T : never);

    const result = await validateWorkspace('/some/file');
    expect(result).toEqual({
      valid: false,
      error: '/some/file is not a directory',
      exitCode: 1,
    });
  });

  it('returns ENOENT error when directory not found', async () => {
    const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(stat).mockRejectedValue(error);

    const result = await validateWorkspace('/nonexistent/path');
    expect(result).toEqual({
      valid: false,
      error: 'Directory not found: /nonexistent/path',
      exitCode: 1,
    });
  });

  it('returns EACCES error when permission denied', async () => {
    const error = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    vi.mocked(stat).mockRejectedValue(error);

    const result = await validateWorkspace('/protected/path');
    expect(result).toEqual({
      valid: false,
      error: 'Permission denied accessing /protected/path',
      exitCode: 1,
    });
  });

  it('returns generic error for other failures', async () => {
    const error = new Error('Unknown error');
    vi.mocked(stat).mockRejectedValue(error);

    const result = await validateWorkspace('/error/path');
    expect(result).toEqual({
      valid: false,
      error: 'Cannot access /error/path: Error: Unknown error',
      exitCode: 1,
    });
  });

  it('handles error with unknown code', async () => {
    const error = Object.assign(new Error('UNKNOWN'), { code: 'UNKNOWN' });
    vi.mocked(stat).mockRejectedValue(error);

    const result = await validateWorkspace('/path');
    expect(result).toEqual({
      valid: false,
      error: 'Cannot access /path: Error: UNKNOWN',
      exitCode: 1,
    });
  });
});

describe('validateBeadsInitialized', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns valid when beads is initialized', async () => {
    vi.mocked(isBeadsInitialized).mockResolvedValue(true);

    const result = await validateBeadsInitialized('/workspace');
    expect(result).toEqual({ valid: true });
  });

  it('returns error when beads is not initialized', async () => {
    vi.mocked(isBeadsInitialized).mockResolvedValue(false);

    const result = await validateBeadsInitialized('/workspace');
    expect(result).toEqual({
      valid: false,
      error:
        'No .beads directory found in /workspace\nRun "bd init" to initialize beads in this directory.',
      exitCode: 1,
    });
  });

  it('includes workspace path in error message', async () => {
    vi.mocked(isBeadsInitialized).mockResolvedValue(false);

    const result = await validateBeadsInitialized('/my/project/path');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('/my/project/path');
    }
  });
});
