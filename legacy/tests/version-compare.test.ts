import {
  compareVersions,
  isBlendVersionNewer,
  parseVersion,
} from '../src/core/blender/version-compare';

import { describe, expect, it } from 'vitest';

describe('Version Compare', () => {
  it('parses version strings properly', () => {
    expect(parseVersion('4.2.0')).toEqual([4, 2, 0]);
    expect(parseVersion('v3.6')).toEqual([3, 6, 0]);
    expect(parseVersion('4.1.2-alpha')).toEqual([4, 1, 2]);
    expect(parseVersion(undefined)).toEqual([0, 0, 0]);
  });

  it('correctly compares version components', () => {
    expect(compareVersions('4.2.0', '3.6.0')).toBe(1);
    expect(compareVersions('3.6.0', '4.2.0')).toBe(-1);
    expect(compareVersions('4.2.0', '4.2.0')).toBe(0);
    expect(compareVersions('4.2.1', '4.2.0')).toBe(1);
    expect(compareVersions('4.2', '4.2.0')).toBe(0);
    expect(compareVersions('5.0.0', '4.99.99')).toBe(1);
  });

  it('correctly detects if a blend version is strictly newer across major/minor', () => {
    // Same major and minor: NOT newer, regardless of patch or subversion
    expect(isBlendVersionNewer('5.2.0', '5.2.0')).toBe(false);
    expect(isBlendVersionNewer('5.2.44', '5.2.0')).toBe(false);
    expect(isBlendVersionNewer('5.2.1', '5.2.0')).toBe(false);
    expect(isBlendVersionNewer('4.2.17', '4.2.0')).toBe(false);

    // Newer major or minor: IS newer
    expect(isBlendVersionNewer('5.3.0', '5.2.0')).toBe(true);
    expect(isBlendVersionNewer('6.0.0', '5.2.0')).toBe(true);
    expect(isBlendVersionNewer('5.0.0', '4.2.0')).toBe(true);

    // Older major or minor: NOT newer (backward compatible)
    expect(isBlendVersionNewer('4.2.0', '5.2.0')).toBe(false);
    expect(isBlendVersionNewer('3.6.0', '5.2.0')).toBe(false);
  });
});
