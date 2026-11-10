import { type PowerSaveBlockerDriver, SleepBlockerManager } from '../src/core/power/sleep-blocker';
import { sampleGpuUtilization } from '../src/core/render/gpu-monitor';
import { killProcessTree } from '../src/core/render/process-killer';

import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('SleepBlockerManager', () => {
  it('acquires and releases sleep blocker with ref counting', () => {
    let blockerCounter = 100;
    const activeBlocks = new Set<number>();

    const mockDriver: PowerSaveBlockerDriver = {
      start: (_type) => {
        const id = blockerCounter++;
        activeBlocks.add(id);
        return id;
      },
      stop: (id) => {
        activeBlocks.delete(id);
      },
      isStarted: (id) => activeBlocks.has(id),
    };

    const manager = new SleepBlockerManager(mockDriver);
    expect(manager.isBlocking()).toBe(false);

    const release1 = manager.acquire();
    expect(manager.isBlocking()).toBe(true);
    expect(activeBlocks.size).toBe(1);

    const release2 = manager.acquire();
    expect(manager.isBlocking()).toBe(true);
    expect(activeBlocks.size).toBe(1); // Same underlying lock held

    release1();
    expect(manager.isBlocking()).toBe(true);
    expect(activeBlocks.size).toBe(1);

    release2();
    expect(manager.isBlocking()).toBe(false);
    expect(activeBlocks.size).toBe(0);
  });
});

describe('Process Killer', () => {
  it('cleanly terminates a spawned child process tree', async () => {
    // Spawn a long-running child process
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
    });

    expect(child.pid).toBeDefined();
    const pid = child.pid!;

    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    child.on('exit', (code, signal) => {
      exitCode = code;
      exitSignal = signal;
    });

    await killProcessTree(pid);

    // Wait for exit
    await new Promise((r) => setTimeout(r, 100));
    expect(child.killed || exitSignal !== null || exitCode !== null).toBe(true);
  });
});

describe('GPU Monitor', () => {
  it('returns verified status or unverified fallback without throwing', async () => {
    const status = await sampleGpuUtilization();
    expect(typeof status.verified).toBe('boolean');
    if (status.verified) {
      expect(typeof status.utilizationPercent).toBe('number');
    }
  });
});
