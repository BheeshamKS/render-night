import {
  type ImageSequenceInfo,
  NATIVE_IMAGE_EXTENSIONS,
  SUPPORTED_SEQUENCE_EXTENSIONS,
} from '../schemas/sequence';

import * as fs from 'node:fs';
import * as path from 'node:path';

interface RawFrame {
  frame: number;
  padding: number;
  filename: string;
  filePath: string;
}

interface FrameGroup {
  directory: string;
  baseName: string;
  extension: string;
  padding: number;
  rawFrames: RawFrame[];
}

/**
 * Scans a directory and groups image files into sequences based on prefix, frame numbers, and extension.
 */
export async function findSequencesInDirectory(dir: string): Promise<ImageSequenceInfo[]> {
  try {
    const stat = await fs.promises.stat(dir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const groups = new Map<string, FrameGroup>();

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const extMatch = entry.name.match(/\.([a-zA-Z0-9]+)$/);
    if (!extMatch) continue;

    const ext = extMatch[1].toLowerCase();
    if (!(SUPPORTED_SEQUENCE_EXTENSIONS as readonly string[]).includes(ext)) {
      continue;
    }

    // Match base name and frame number: e.g. "shot_0042.png" or "0001.exr", or single still "render.png"
    const nameMatch = entry.name.match(/^(.*?)(\d+)\.([a-zA-Z0-9]+)$/);
    let baseName: string;
    let frame = 1;
    let padding = 1;

    if (nameMatch) {
      baseName = nameMatch[1];
      const frameDigits = nameMatch[2];
      frame = parseInt(frameDigits, 10);
      padding = frameDigits.length;
    } else {
      // Single still image without frame digits
      baseName = entry.name.replace(/\.[a-zA-Z0-9]+$/, '');
      frame = 1;
      padding = 1;
    }

    const groupKey = `${baseName}::${ext}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        directory: path.resolve(dir),
        baseName,
        extension: ext,
        padding,
        rawFrames: [],
      };
      groups.set(groupKey, group);
    }

    group.rawFrames.push({
      frame,
      padding,
      filename: entry.name,
      filePath: path.resolve(dir, entry.name),
    });
  }

  const results: ImageSequenceInfo[] = [];

  for (const group of groups.values()) {
    if (group.rawFrames.length === 0) continue;

    // Deduplicate and sort frames
    const frameMap = new Map<number, string>();
    for (const rf of group.rawFrames) {
      if (!frameMap.has(rf.frame)) {
        frameMap.set(rf.frame, rf.filePath);
      }
    }

    const sortedFrames = Array.from(frameMap.keys()).sort((a, b) => a - b);
    const startFrame = sortedFrames[0];
    const endFrame = sortedFrames[sortedFrames.length - 1];
    const frameSet = new Set(sortedFrames);

    const missingFrames: number[] = [];
    for (let f = startFrame; f <= endFrame; f++) {
      if (!frameSet.has(f)) {
        missingFrames.push(f);
      }
    }

    // Determine max padding among frames or fallback to default
    const maxPadding = Math.max(...group.rawFrames.map((rf) => rf.padding), 1);
    const pattern = path.join(
      group.directory,
      `${group.baseName}%0${maxPadding}d.${group.extension}`,
    );

    const filePaths: Record<number, string> = {};
    for (const [f, p] of frameMap.entries()) {
      filePaths[f] = p;
    }

    const isNativeFormat = (NATIVE_IMAGE_EXTENSIONS as readonly string[]).includes(group.extension);

    results.push({
      directory: group.directory,
      baseName: group.baseName,
      extension: group.extension,
      pattern,
      padding: maxPadding,
      startFrame,
      endFrame,
      totalFrames: sortedFrames.length,
      frames: sortedFrames,
      filePaths,
      missingFrames,
      isNativeFormat,
    });
  }

  // Sort sequences by frame count descending
  return results.sort((a, b) => b.totalFrames - a.totalFrames);
}

/**
 * Detects an image sequence from either a directory path or an individual frame file path.
 */
export async function detectSequence(dirOrPath: string): Promise<ImageSequenceInfo | null> {
  if (!dirOrPath) return null;
  let targetDir = dirOrPath;
  let targetFile: string | null = null;

  try {
    const stat = await fs.promises.stat(dirOrPath);
    if (!stat.isDirectory()) {
      targetDir = path.dirname(dirOrPath);
      targetFile = path.basename(dirOrPath);
    }
  } catch {
    const parentDir = path.dirname(dirOrPath);
    try {
      const parentStat = await fs.promises.stat(parentDir);
      if (parentStat.isDirectory()) {
        targetDir = parentDir;
        targetFile = path.basename(dirOrPath);
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  const sequences = await findSequencesInDirectory(targetDir);
  if (sequences.length === 0) {
    return null;
  }

  if (targetFile) {
    const cleanTarget = targetFile.replace(/#+/g, '');
    const fileMatch = cleanTarget.match(/^(.*?)(\d*)\.([a-zA-Z0-9]+)$/);
    if (fileMatch) {
      const baseName = fileMatch[1];
      const ext = fileMatch[3].toLowerCase();
      const match = sequences.find(
        (s) => (s.baseName === baseName || s.baseName.startsWith(baseName)) && s.extension === ext,
      );
      if (match) {
        return match;
      }
    }
  }

  return sequences[0] || null;
}
