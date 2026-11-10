import { runCliQueue } from '../src/cli/runner';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CLI Queue Runner', () => {
  it('runs a valid queue in dry-run mode and returns exit code 0', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-cli-test-'));
    const dummyBlend = path.join(tmp, 'sample.blend');
    fs.writeFileSync(dummyBlend, 'BLENDER_DUMMY');

    const queueFile = path.join(tmp, 'queue.json');
    fs.writeFileSync(
      queueFile,
      JSON.stringify({
        jobs: [
          {
            blendPath: dummyBlend,
            camera: 'Camera',
            range: '1-5',
          },
        ],
      }),
    );

    const res = await runCliQueue({
      queueFile,
      dryRun: true,
      blender: path.resolve(__dirname, '../tools/mock-blender/index.js'),
    });

    expect(res.exitCode).toBe(0);
    expect(res.summary.dryRun).toBe(true);
    expect(res.summary.totalJobs).toBe(1);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns exit code 2 when queue file does not exist or has invalid JSON', async () => {
    const res1 = await runCliQueue({ queueFile: '/non/existent/queue.json' });
    expect(res1.exitCode).toBe(2);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-cli-test-'));
    const badJson = path.join(tmp, 'bad.json');
    fs.writeFileSync(badJson, '{ invalid json');

    const res2 = await runCliQueue({ queueFile: badJson });
    expect(res2.exitCode).toBe(2);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('returns exit code 2 when schema validation fails', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-cli-test-'));
    const invalidSchema = path.join(tmp, 'invalid.json');
    fs.writeFileSync(invalidSchema, JSON.stringify({ jobs: [] }));

    const res = await runCliQueue({ queueFile: invalidSchema });
    expect(res.exitCode).toBe(2);

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
