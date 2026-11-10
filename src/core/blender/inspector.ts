import { inspectOutputSchema, type InspectOutput } from '../schemas';

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export class InspectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InspectorError';
  }
}

function scriptPath(): string {
  return resolve(__dirname, '../../../resources/python/inspect_blend.py');
}

/**
 * Inspect a .blend file using Blender's Python API (headless, no GUI).
 * Returns a validated InspectOutput.
 */
export async function inspectBlend(blendPath: string, blenderPath: string): Promise<InspectOutput> {
  if (!existsSync(blendPath)) {
    throw new InspectorError(`Blend file not found: ${blendPath}`);
  }
  if (!existsSync(blenderPath)) {
    throw new InspectorError(`Blender not found at: ${blenderPath}`);
  }

  const script = scriptPath();
  if (!existsSync(script)) {
    throw new InspectorError(`inspect_blend.py not found at: ${script}`);
  }

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = execFile(
      blenderPath,
      ['--python', script, '--', blendPath],
      {
        timeout: 120_000,
        maxBuffer: 32 * 1024 * 1024,
        env: {
          ...process.env,
          BLENDER_USER_SCRIPTS: '',
          BLENDER_SYSTEM_SCRIPTS: '',
        },
      },
      (err, out, errOut) => {
        stdout = out;
        stderr = errOut;
        if (err) {
          // Blender often exits non-zero even on success; we look for the JSON.
        }
      },
    );

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.on('close', () => {
      // The script prints a JSON object on its own line, prefixed with a marker.
      const lines = stdout.split(/\r?\n/);
      const jsonLine = lines.find((l) => l.startsWith('RN_INSPECT_JSON::'));
      if (!jsonLine) {
        reject(new InspectorError(`No inspect JSON in output. stderr: ${stderr.slice(0, 500)}`));
        return;
      }
      const jsonStr = jsonLine.slice('RN_INSPECT_JSON::'.length);
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        reject(new InspectorError(`Invalid JSON from inspector: ${jsonStr.slice(0, 200)}...`));
        return;
      }
      const result = inspectOutputSchema.safeParse(parsed);
      if (!result.success) {
        reject(new InspectorError(`Inspector output failed validation: ${result.error.message}`));
        return;
      }
      resolve(result.data);
    });

    child.on('error', (err) => {
      reject(new InspectorError(`Failed to spawn Blender: ${err.message}`));
    });
  });
}
