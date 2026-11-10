import { HeaderReadError, parseBlendHeaderBytes } from '../src/core/blender/header-reader';

import { describe, expect, it } from 'vitest';

describe('Blend Header Reader', () => {
  it('parses Blender 4.2.0 64-bit little-endian header', () => {
    // 12 bytes: BLENDER_v402
    const buffer = Buffer.from('BLENDER_v402');
    const header = parseBlendHeaderBytes(buffer);
    expect(header).toEqual({
      version: '4.2.0',
      major: 4,
      minor: 2,
      patch: 0,
      is64Bit: true,
      littleEndian: true,
    });
  });

  it('parses Blender 3.6.0 32-bit big-endian header', () => {
    // 12 bytes: BLENDER-V306
    const buffer = Buffer.from('BLENDER-V306');
    const header = parseBlendHeaderBytes(buffer);
    expect(header).toEqual({
      version: '3.6.0',
      major: 3,
      minor: 6,
      patch: 0,
      is64Bit: false,
      littleEndian: false,
    });
  });

  it('parses Blender 5.0.0 header', () => {
    const buffer = Buffer.from('BLENDER_v500');
    const header = parseBlendHeaderBytes(buffer);
    expect(header.version).toBe('5.0.0');
  });

  it('throws HeaderReadError on short buffer', () => {
    const buffer = Buffer.from('BLENDER');
    expect(() => parseBlendHeaderBytes(buffer)).toThrow(HeaderReadError);
  });

  it('throws HeaderReadError on non-blend magic', () => {
    const buffer = Buffer.from('NOT_A_BLEND!');
    expect(() => parseBlendHeaderBytes(buffer)).toThrow(HeaderReadError);
  });
});
