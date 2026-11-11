import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cliEntry = path.resolve(__dirname, '../src/cli/index.ts');
const cliBundle = path.resolve(__dirname, '../dist-cli/night-render.cjs');

describe('CLI Main Entry', () => {
  it('exits with code 2 on invalid flags or missing queue file', async () => {
    try {
      await execFileAsync('npx', ['tsx', cliEntry, '--queue', 'non_existent.json']);
      expect.fail('Should have exited with code 2');
    } catch (err: unknown) {
      expect((err as { code?: number }).code).toBe(2);
    }
  });

  it('exits with code 0 on list-blenders', async () => {
    const { stdout } = await execFileAsync('npx', ['tsx', cliEntry, 'list-blenders']);
    expect(stdout).toMatch(/Blender/i);
  });

  it('exits with code 0 on --help', async () => {
    const { stdout } = await execFileAsync('npx', ['tsx', cliEntry, '--help']);
    expect(stdout).toMatch(/Usage:/i);
  });

  it('exits with code 0 on --version', async () => {
    const { stdout } = await execFileAsync('npx', ['tsx', cliEntry, '--version']);
    expect(stdout).toMatch(/0\.1\.0/);
  });

  it('runs bundled cjs with node --help and --version', async () => {
    const { stdout: helpOut } = await execFileAsync('node', [cliBundle, '--help']);
    expect(helpOut).toMatch(/Night Render CLI/i);
    expect(helpOut).toMatch(/Usage:/i);

    const { stdout: verOut } = await execFileAsync('node', [cliBundle, '--version']);
    expect(verOut).toMatch(/0\.1\.0-alpha\.2/);
  });
});
