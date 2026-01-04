// CLI validation utilities - extracted for testability
import { stat } from 'node:fs/promises';
import { isBeadsInitialized } from '../core';

export type ValidationResult = { valid: true } | { valid: false; error: string; exitCode: number };

/**
 * Validate that the workspace path exists and is a directory.
 * Returns a ValidationResult with error details on failure.
 */
export async function validateWorkspace(workspacePath: string): Promise<ValidationResult> {
  try {
    const stats = await stat(workspacePath);
    if (!stats.isDirectory()) {
      return {
        valid: false,
        error: `${workspacePath} is not a directory`,
        exitCode: 1,
      };
    }
    return { valid: true };
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {
          valid: false,
          error: `Directory not found: ${workspacePath}`,
          exitCode: 1,
        };
      }
      if (code === 'EACCES') {
        return {
          valid: false,
          error: `Permission denied accessing ${workspacePath}`,
          exitCode: 1,
        };
      }
    }
    return {
      valid: false,
      error: `Cannot access ${workspacePath}: ${err}`,
      exitCode: 1,
    };
  }
}

/**
 * Check if beads is initialized in the workspace.
 * Returns a ValidationResult with error details on failure.
 */
export async function validateBeadsInitialized(workspacePath: string): Promise<ValidationResult> {
  if (!(await isBeadsInitialized(workspacePath))) {
    return {
      valid: false,
      error: `No .beads directory found in ${workspacePath}\nRun "bd init" to initialize beads in this directory.`,
      exitCode: 1,
    };
  }
  return { valid: true };
}
