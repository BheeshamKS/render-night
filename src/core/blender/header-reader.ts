import * as fs from 'node:fs';

export interface BlendHeaderInfo {
  version: string;
  major: number;
  minor: number;
  patch: number;
  is64Bit: boolean;
  littleEndian: boolean;
}

export class HeaderReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HeaderReadError';
  }
}

/**
 * Parse the 12-byte header of a Blender file:
 * - Bytes 0..6: "BLENDER"
 * - Byte 7: '_' = 64-bit, '-' = 32-bit
 * - Byte 8: 'v' = little-endian, 'V' = big-endian
 * - Bytes 9..11: 3-digit version (e.g. "402" -> 4.2.0, "306" -> 3.6.0, "500" -> 5.0.0)
 */
export function parseBlendHeaderBytes(buffer: Buffer | Uint8Array): BlendHeaderInfo {
  if (buffer.length < 12) {
    throw new HeaderReadError(
      `File too short to be a .blend file (${buffer.length} bytes, minimum 12 required)`,
    );
  }

  const magic = Buffer.from(buffer.slice(0, 7)).toString('ascii');
  if (magic !== 'BLENDER') {
    throw new HeaderReadError(`Invalid magic header: expected "BLENDER", got "${magic}"`);
  }

  const ptrChar = String.fromCharCode(buffer[7]);
  const endianChar = String.fromCharCode(buffer[8]);
  const verStr = Buffer.from(buffer.slice(9, 12)).toString('ascii');

  const is64Bit = ptrChar === '_';
  const littleEndian = endianChar === 'v';

  const major = Number.parseInt(verStr[0], 10);
  const minor = Number.parseInt(verStr.slice(1), 10);
  const patch = 0;

  if (Number.isNaN(major) || Number.isNaN(minor)) {
    throw new HeaderReadError(`Could not parse Blender version string from header: "${verStr}"`);
  }

  return {
    version: `${major}.${minor}.${patch}`,
    major,
    minor,
    patch,
    is64Bit,
    littleEndian,
  };
}

/**
 * Read the header bytes of a .blend file cheaply from disk without loading the whole file.
 */
export async function readBlendHeader(filePath: string): Promise<BlendHeaderInfo> {
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    const { bytesRead } = await fd.read(buf, 0, 12, 0);
    if (bytesRead < 12) {
      throw new HeaderReadError(`Failed to read 12-byte header: only read ${bytesRead} bytes`);
    }
    return parseBlendHeaderBytes(buf);
  } finally {
    await fd.close();
  }
}
