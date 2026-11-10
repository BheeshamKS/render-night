import { inspectOutputSchema } from '../src/core/schemas/inspect';

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Inspect Schema Validation', () => {
  it('validates a complete inspect JSON output from fixture', () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/inspect-sample.json');
    const raw = fs.readFileSync(fixturePath, 'utf8');
    const parsed = JSON.parse(raw);
    const result = inspectOutputSchema.safeParse(parsed);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blenderVersion).toBe('4.2.0');
      expect(result.data.scenes[0].name).toBe('Scene');
      expect(result.data.scenes[0].activeCamera).toBe('Camera');
      expect(result.data.scenes[0].cameras).toEqual(['Camera', 'Camera.001']);
      expect(result.data.missingFiles?.[0].type).toBe('image');
      expect(result.data.cyclesDevices?.[0].name).toBe('NVIDIA GeForce RTX 4090');
    }
  });

  it('rejects inspect output missing required fields', () => {
    const invalid = {
      schemaVersion: 1,
      // missing blenderVersion, scenes, etc.
    };
    const result = inspectOutputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
