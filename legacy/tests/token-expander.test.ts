import { expandTokens, previewTokens } from '../src/core/render/token-expander';

import { describe, expect, it } from 'vitest';

describe('Token Expander', () => {
  const ctx = {
    project: 'Character_Rig',
    scene: 'Shot_01',
    camera: 'Cam_CloseUp',
  };

  it('expands basic project, scene, camera tokens', () => {
    const template = '//renders/{project}/{scene}_{camera}';
    const result = expandTokens(template, ctx);
    expect(result).toBe('//renders/Character_Rig/Shot_01_Cam_CloseUp');
  });

  it('expands frame hashes when frame is provided', () => {
    const template = '//renders/{project}/{scene}_####.png';
    const result = expandTokens(template, { ...ctx, frame: 42 });
    expect(result).toBe('//renders/Character_Rig/Shot_01_0042.png');
  });

  it('supports different hash counts', () => {
    const template = '//output/frame_##_####_######.png';
    const result = expandTokens(template, { ...ctx, frame: 5 });
    expect(result).toBe('//output/frame_05_0005_000005.png');
  });

  it('keeps hashes intact when frame is undefined in expandTokens', () => {
    const template = '//renders/{project}/{scene}_####.png';
    const result = expandTokens(template, ctx);
    expect(result).toBe('//renders/Character_Rig/Shot_01_####.png');
  });

  it('previewTokens replaces hashes with frame 1 by default', () => {
    const template = '//renders/{project}/{scene}_####.png';
    const result = previewTokens(template, ctx);
    expect(result).toBe('//renders/Character_Rig/Shot_01_0001.png');
  });

  it('handles empty or missing camera/scene gracefully', () => {
    const template = '{project}_{scene}_{camera}';
    const result = expandTokens(template, { project: 'Test', scene: '', camera: '' });
    expect(result).toBe('Test__');
  });

  it('handles frame 0 and negative frame numbers correctly', () => {
    const template = '//renders/{project}/frame_####.png';
    const zeroResult = expandTokens(template, { ...ctx, frame: 0 });
    expect(zeroResult).toBe('//renders/Character_Rig/frame_0000.png');

    const negResult = expandTokens(template, { ...ctx, frame: -5 });
    expect(negResult).toBe('//renders/Character_Rig/frame_-0005.png');
  });

  it('preserves full digits when frame number length exceeds hash count', () => {
    const template = '//renders/{project}/frame_##.png';
    const result = expandTokens(template, { ...ctx, frame: 12345 });
    expect(result).toBe('//renders/Character_Rig/frame_12345.png');
  });

  it('handles repeated token occurrences and Windows path structures', () => {
    const template = 'D:\\Renders\\{project}\\{project}_{scene}_{camera}_{scene}_####.exr';
    const result = expandTokens(template, { ...ctx, frame: 10 });
    expect(result).toBe(
      'D:\\Renders\\Character_Rig\\Character_Rig_Shot_01_Cam_CloseUp_Shot_01_0010.exr',
    );
  });
});
