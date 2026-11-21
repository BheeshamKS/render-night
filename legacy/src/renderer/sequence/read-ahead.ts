/**
 * Computes an ordered list of frame numbers that need decoding, prioritised by proximity
 * to the playhead and playback direction.
 */
export function getPrioritizedDecodeList(
  currentFrame: number,
  direction: 1 | -1,
  startFrame: number,
  endFrame: number,
  loop: boolean,
  lookAheadCount: number,
  isCached: (frame: number) => boolean,
  isInFlight: (frame: number) => boolean,
): number[] {
  const result: number[] = [];
  const added = new Set<number>();

  const rangeLength = endFrame - startFrame + 1;
  if (rangeLength <= 0) return result;

  const tryAdd = (f: number) => {
    let normalized = f;
    if (normalized > endFrame) {
      if (!loop) return;
      normalized = startFrame + ((normalized - startFrame) % rangeLength);
    } else if (normalized < startFrame) {
      if (!loop) return;
      const underflow = (startFrame - normalized) % rangeLength;
      normalized = endFrame - underflow + 1;
      if (normalized > endFrame) normalized = startFrame;
    }

    if (!added.has(normalized) && !isCached(normalized) && !isInFlight(normalized)) {
      added.add(normalized);
      result.push(normalized);
    }
  };

  // 1. Current frame has absolute top priority
  tryAdd(currentFrame);

  // 2. Look-ahead in playback direction
  for (let i = 1; i <= lookAheadCount; i++) {
    tryAdd(currentFrame + direction * i);
  }

  // 3. Small reverse cushion (1-4 frames behind) for immediate reverse step / scrub
  const reverseCushion = Math.min(6, Math.max(2, Math.floor(lookAheadCount / 8)));
  for (let i = 1; i <= reverseCushion; i++) {
    tryAdd(currentFrame - direction * i);
  }

  return result;
}

/**
 * Identifies frame decode tasks that are no longer relevant (e.g. when the playhead jumps).
 */
export function isJobStale(
  jobFrame: number,
  currentFrame: number,
  startFrame: number,
  endFrame: number,
  loop: boolean,
  maxDistance: number,
): boolean {
  let diff = Math.abs(jobFrame - currentFrame);
  if (loop) {
    const rangeLength = endFrame - startFrame + 1;
    diff = Math.min(diff, rangeLength - diff);
  }
  return diff > maxDistance;
}
