// Tests for CLI constants and helper functions

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getShortId,
  getStatusColor,
  getStatusIcon,
  getTypeIcon,
  STATUS_ICONS,
  TYPE_ICONS,
} from './constants';

describe('STATUS_ICONS', () => {
  it('has icons for all standard statuses', () => {
    expect(STATUS_ICONS.open).toBe('○');
    expect(STATUS_ICONS.in_progress).toBe('●');
    expect(STATUS_ICONS.blocked).toBe('✖');
    expect(STATUS_ICONS.closed).toBe('✓');
    expect(STATUS_ICONS.tombstone).toBe('🗑');
  });
});

describe('TYPE_ICONS', () => {
  it('has icons for all standard types', () => {
    expect(TYPE_ICONS.bug).toBe('🐛');
    expect(TYPE_ICONS.feature).toBe('💡');
    expect(TYPE_ICONS.epic).toBe('🚀');
    expect(TYPE_ICONS.chore).toBe('🔧');
    expect(TYPE_ICONS.task).toBe('📋');
  });
});

describe('getStatusIcon', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns correct icon for valid statuses', () => {
    expect(getStatusIcon('open')).toBe('○');
    expect(getStatusIcon('in_progress')).toBe('●');
    expect(getStatusIcon('blocked')).toBe('✖');
    expect(getStatusIcon('closed')).toBe('✓');
    expect(getStatusIcon('tombstone')).toBe('🗑');
  });

  it('returns unknown icon for invalid status', () => {
    expect(getStatusIcon('invalid')).toBe('?');
    expect(warnSpy).toHaveBeenCalledWith('[cli] Unknown status "invalid", using unknown icon');
  });

  it('returns unknown icon for empty string', () => {
    expect(getStatusIcon('')).toBe('?');
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('getTypeIcon', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns correct icon for valid types', () => {
    expect(getTypeIcon('bug')).toBe('🐛');
    expect(getTypeIcon('feature')).toBe('💡');
    expect(getTypeIcon('epic')).toBe('🚀');
    expect(getTypeIcon('chore')).toBe('🔧');
    expect(getTypeIcon('task')).toBe('📋');
  });

  it('returns unknown icon for invalid type', () => {
    expect(getTypeIcon('invalid')).toBe('❓');
    expect(warnSpy).toHaveBeenCalledWith('[cli] Unknown issue_type "invalid", using unknown icon');
  });

  it('returns unknown icon for empty string', () => {
    expect(getTypeIcon('')).toBe('❓');
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('getStatusColor', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns correct color for valid statuses', () => {
    expect(getStatusColor('open')).toBe('white');
    expect(getStatusColor('in_progress')).toBe('yellow');
    expect(getStatusColor('blocked')).toBe('red');
    expect(getStatusColor('closed')).toBe('green');
    expect(getStatusColor('tombstone')).toBe('gray');
  });

  it('returns magenta for invalid status to make it visible', () => {
    expect(getStatusColor('invalid')).toBe('magenta');
    expect(warnSpy).toHaveBeenCalledWith('[cli] Unknown status "invalid" for color, using magenta');
  });

  it('returns magenta for empty string', () => {
    expect(getStatusColor('')).toBe('magenta');
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('getShortId', () => {
  it('extracts last segment after hyphen', () => {
    expect(getShortId('beadsx-123')).toBe('123');
    expect(getShortId('beadsx-abc')).toBe('abc');
    expect(getShortId('prefix-middle-end')).toBe('end');
  });

  it('returns original ID if no hyphen', () => {
    expect(getShortId('123')).toBe('123');
    expect(getShortId('abc')).toBe('abc');
  });

  it('handles empty string', () => {
    expect(getShortId('')).toBe('');
  });

  it('handles ID ending with hyphen', () => {
    // split('-').pop() returns '' for trailing hyphen
    expect(getShortId('beadsx-')).toBe('');
  });
});
