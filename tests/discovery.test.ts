import {
  candidateExecutablesForPlatform,
  parseBlenderVersionOutput,
  sortBlendersDesc,
  type BlenderInstallation,
} from '../src/core/blender/discovery';

import { describe, expect, it } from 'vitest';

describe('Blender Discovery', () => {
  it('parses blender --version stdout correctly', () => {
    const stdout = `Blender 4.2.0 LTS (sub 0)
    build date: 2024-07-16
    build time: 06:19:15
    build commit date: 2024-07-16
    build commit time: 06:19
    build hash: a51f305417fb
    build platform: Linux`;

    const parsed = parseBlenderVersionOutput(stdout);
    expect(parsed).toEqual({
      version: '4.2.0',
      major: 4,
      minor: 2,
      patch: 0,
    });
  });

  it('parses Blender 3.6.12 version string', () => {
    const stdout = 'Blender 3.6.12 (sub 0)';
    const parsed = parseBlenderVersionOutput(stdout);
    expect(parsed.version).toBe('3.6.12');
    expect(parsed.major).toBe(3);
    expect(parsed.minor).toBe(6);
    expect(parsed.patch).toBe(12);
  });

  it('sorts installations by semver descending (latest first)', () => {
    const installs: BlenderInstallation[] = [
      {
        id: '1',
        executable: ['/usr/bin/blender-3.6'],
        displayPath: '/usr/bin/blender-3.6',
        version: '3.6.12',
        major: 3,
        minor: 6,
        patch: 12,
        isPortable: false,
        source: 'system',
      },
      {
        id: '2',
        executable: ['/usr/bin/blender-5.0'],
        displayPath: '/usr/bin/blender-5.0',
        version: '5.0.0',
        major: 5,
        minor: 0,
        patch: 0,
        isPortable: false,
        source: 'system',
      },
      {
        id: '3',
        executable: ['/usr/bin/blender-4.2'],
        displayPath: '/usr/bin/blender-4.2',
        version: '4.2.1',
        major: 4,
        minor: 2,
        patch: 1,
        isPortable: false,
        source: 'system',
      },
    ];

    const sorted = sortBlendersDesc(installs);
    expect(sorted.map((i) => i.version)).toEqual(['5.0.0', '4.2.1', '3.6.12']);
  });

  it('generates Linux candidates including Flatpak argv array and system paths', () => {
    const candidates = candidateExecutablesForPlatform('linux');
    // Checks that flatpak argv array is present
    const hasFlatpak = candidates.some(
      (c) => Array.isArray(c) && c[0] === 'flatpak' && c.includes('org.blender.Blender'),
    );
    expect(hasFlatpak).toBe(true);

    // Checks that /usr/bin/blender or PATH candidates are present
    const hasUsrBin = candidates.some((c) => Array.isArray(c) && c[0] === '/usr/bin/blender');
    expect(hasUsrBin).toBe(true);
  });

  it('generates Windows candidates including Blender Foundation and Steam', () => {
    const candidates = candidateExecutablesForPlatform('win32');
    const strings = candidates.map((c) => (Array.isArray(c) ? c[0] : c));
    expect(strings.some((s) => s.includes('Blender Foundation'))).toBe(true);
    expect(strings.some((s) => s.includes('Steam'))).toBe(true);
  });

  it('generates macOS candidates for /Applications and ~/Applications', () => {
    const candidates = candidateExecutablesForPlatform('darwin');
    const strings = candidates.map((c) => (Array.isArray(c) ? c[0] : c));
    expect(strings.some((s) => s.includes('/Applications/Blender.app'))).toBe(true);
  });
});
