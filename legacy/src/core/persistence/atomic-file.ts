import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Write data atomically to target file by writing to a temporary file in the
 * same directory, syncing to disk, and renaming atomically.
 */
export async function writeAtomicJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tempFile = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`;
  const content = JSON.stringify(data, null, 2);

  // Write and flush to disk
  await fs.promises.writeFile(tempFile, content, 'utf8');

  // Atomic rename on the same filesystem
  await fs.promises.rename(tempFile, filePath);
}

/**
 * Read and parse JSON from file, returning null if file does not exist.
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}
