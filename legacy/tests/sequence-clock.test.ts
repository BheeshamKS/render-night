import { calculateTargetFrame, SequenceClock } from '../src/renderer/sequence/clock';

import { describe, expect, it } from 'vitest';

describe('SequenceClock & calculateTargetFrame Math', () => {
  it('advances frames linearly according to elapsed time and fps', () => {
    const opts = {
      fps: 24,
      speed: 1,
      loop: false,
      startFrame: 1,
      endFrame: 100,
    };

    // At 0s: baseFrame
    expect(calculateTargetFrame(0, 1, opts).frame).toBe(1);

    // At 0.5s: 0.5 * 24 = 12 frames -> 1 + 12 = 13
    expect(calculateTargetFrame(0.5, 1, opts).frame).toBe(13);

    // At 1.0s: 1.0 * 24 = 24 frames -> 1 + 24 = 25
    expect(calculateTargetFrame(1.0, 1, opts).frame).toBe(25);
  });

  it('handles speed multipliers (0.5x, 2x)', () => {
    const optsHalf = {
      fps: 24,
      speed: 0.5,
      loop: false,
      startFrame: 1,
      endFrame: 100,
    };
    // At 1.0s @ 0.5x: 1.0 * 24 * 0.5 = 12 frames -> 1 + 12 = 13
    expect(calculateTargetFrame(1.0, 1, optsHalf).frame).toBe(13);

    const optsDouble = {
      fps: 24,
      speed: 2,
      loop: false,
      startFrame: 1,
      endFrame: 100,
    };
    // At 1.0s @ 2x: 1.0 * 24 * 2 = 48 frames -> 1 + 48 = 49
    expect(calculateTargetFrame(1.0, 1, optsDouble).frame).toBe(49);
  });

  it('handles reverse shuttle playback (negative speed)', () => {
    const optsReverse = {
      fps: 24,
      speed: -1,
      loop: false,
      startFrame: 1,
      endFrame: 100,
    };
    // From frame 50: at 1s, moves backwards 24 frames -> 50 - 24 = 26
    expect(calculateTargetFrame(1.0, 50, optsReverse).frame).toBe(26);

    // Stops at startFrame when loop is false
    expect(calculateTargetFrame(5.0, 50, optsReverse).frame).toBe(1);
  });

  it('loops cleanly across boundaries when loop is true', () => {
    const optsLoop = {
      fps: 24,
      speed: 1,
      loop: true,
      startFrame: 1,
      endFrame: 10, // 10 frames total
    };
    // At 0.5s: 12 frames advance from 1 -> 13 -> wraps to 3
    const res = calculateTargetFrame(0.5, 1, optsLoop);
    expect(res.wrapped).toBe(true);
    expect(res.frame).toBe(3);
  });

  it('respects In and Out boundary points', () => {
    const optsInOut = {
      fps: 24,
      speed: 1,
      loop: true,
      startFrame: 1,
      endFrame: 100,
      inPoint: 10,
      outPoint: 20, // Range length = 11 (10 to 20)
    };

    // Frame starting at InPoint 10, advance 12 frames -> wraps to 11
    const res = calculateTargetFrame(0.5, 10, optsInOut);
    expect(res.frame).toBe(11);
    expect(res.wrapped).toBe(true);
  });

  it('SequenceClock state transitions, step and seek', () => {
    const clock = new SequenceClock(1, {
      fps: 24,
      speed: 1,
      loop: true,
      startFrame: 1,
      endFrame: 50,
      mode: 'realtime',
    });

    expect(clock.isPlaying).toBe(false);
    clock.play(1000);
    expect(clock.isPlaying).toBe(true);

    // Update 500ms later -> 12 frames
    const tick = clock.update(1500);
    expect(tick.frame).toBe(13);
    expect(tick.hasChanged).toBe(true);

    // Step pauses and steps
    clock.step(5);
    expect(clock.isPlaying).toBe(false);
    expect(clock.currentFrame).toBe(18);

    // Seek sets frame
    clock.seek(40);
    expect(clock.currentFrame).toBe(40);
  });

  it('pauses and resumes clock for every-frame decode waiting without time drift', () => {
    const clock = new SequenceClock(1, {
      fps: 24,
      speed: 1,
      loop: true,
      startFrame: 1,
      endFrame: 50,
      mode: 'every-frame',
    });

    clock.play(1000);
    // At t=1100, frame needs decode, clock pauses
    clock.pauseForDecode(1100);
    expect(clock.isPausedForDecode).toBe(true);

    // Update during decode wait does not advance frame
    const pausedTick = clock.update(1400);
    expect(pausedTick.hasChanged).toBe(false);

    // Resumes at t=1500 (400ms spent waiting)
    clock.resumeFromDecode(1500);
    expect(clock.isPausedForDecode).toBe(false);

    // Now update at t=1600: total active time is only 200ms (100ms before + 100ms after)
    const activeTick = clock.update(1600);
    // 200ms * 24fps = 4.8 -> 4 frames advanced from 1 -> 5
    expect(activeTick.frame).toBe(5);
  });
});
