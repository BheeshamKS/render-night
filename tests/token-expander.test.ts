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
});
