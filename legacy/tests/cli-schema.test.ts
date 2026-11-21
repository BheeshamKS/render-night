import { validateCliQueue } from '../src/core/schemas/cli';

import { describe, expect, it } from 'vitest';

describe('CLI Queue Schema', () => {
  it('validates a correct queue.json object with overrides and range', () => {
    const valid = {
      blender: 'latest',
      postAction: 'sleep',
      jobs: [
        {
          blendPath: '/renders/scene.blend',
          scene: 'Scene',
          camera: 'Camera',
          range: '1-50',
          overrides: { 'scene.cycles.samples': 128 },
          renderMissingOnly: true,
          stitchToMp4: true,
        },
      ],
    };
    const parsed = validateCliQueue(valid);
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.blender).toBe('latest');
    expect(parsed.postAction).toBe('sleep');
    expect(parsed.jobs[0].renderMissingOnly).toBe(true);
  });

  it('validates structured simple range object', () => {
    const valid = {
      jobs: [
        {
          blendPath: '/renders/scene.blend',
          range: { start: 10, end: 30, step: 2 },
        },
      ],
    };
    const parsed = validateCliQueue(valid);
    expect(parsed.jobs[0].range).toEqual({ start: 10, end: 30, step: 2 });
  });

  it('rejects invalid inputs with descriptive error', () => {
    expect(() => validateCliQueue({ jobs: 'not-an-array' })).toThrow();
    expect(() => validateCliQueue({ jobs: [] })).toThrow();
    expect(() => validateCliQueue({ jobs: [{ missingBlendPath: true }] })).toThrow();
  });
});
