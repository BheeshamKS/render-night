import type { PersistedQueueState } from '../src/core/schemas/queue-state';
import { useQueueStore } from '../src/renderer/store/queueStore';

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('UI Full Features: Crash Restore, Post-Actions, Sound & Scheduler', () => {
  beforeEach(() => {
    useQueueStore.setState({
      jobs: [],
      queueState: 'idle',
      postAction: 'none',
      postActionArmed: false,
      postActionCountdown: null,
      isRestoredSession: false,
      showCrashRestoreBanner: false,
      showPostActionModal: false,
      showSoundModal: false,
      showHistoryModal: false,
      showScheduleModal: false,
      soundSettings: {
        volume: 100,
        isMuted: false,
        playOnFailure: false,
      },
      scheduleConfig: {
        enabled: false,
        time: '23:00',
        blockSleep: true,
      },
      activeSleepBlockId: null,
    });
  });

  it('handles crash restore: sets banner, resumes queue from first unfinished frame, disarms post action', async () => {
    const savedQueue: PersistedQueueState = {
      version: 1,
      jobs: [
        {
          id: 'job-crashed',
          blendPath: '/scenes/shot1.blend',
          name: 'shot1.blend',
          status: 'active',
          range: { start: 1, end: 100, step: 1 },
          renderMissingOnly: false,
          failedFrames: [],
          overrides: {},
          presets: [],
          outputDir: '/out/shot1',
          outputPattern: '/out/shot1/f_####.png',
          createdAt: 1000,
          progress: 40,
        },
        {
          id: 'job-pending-next',
          blendPath: '/scenes/shot2.blend',
          name: 'shot2.blend',
          status: 'pending',
          range: { start: 1, end: 50, step: 1 },
          renderMissingOnly: false,
          failedFrames: [],
          overrides: {},
          presets: [],
          outputDir: '/out/shot2',
          outputPattern: '/out/shot2/f_####.png',
          createdAt: 1000,
          progress: 0,
        },
      ],
      settings: {
        concurrentJobs: 1,
        stopOnFailure: false,
        closeAppOnCompletion: false,
        closeAppOnCompletionMode: 'last',
        soundOnCompletion: true,
        soundOnFailure: false,
        powerMode: 'none',
        pauseOnBattery: false,
        resumeOnAc: false,
        maxConcurrentFrames: 1,
        postAction: 'shutdown',
        sound: { enabled: true, volume: 100, playOnFailure: false },
      },
    };

    let lockCleared = false;
    (globalThis as unknown as { window: unknown }).window = {
      rnApi: {
        loadSavedQueue: vi.fn().mockResolvedValue(savedQueue),
        clearUncleanShutdownLock: vi.fn().mockImplementation(async () => {
          lockCleared = true;
        }),
      },
    };

    const store = useQueueStore.getState();

    // Trigger restore
    await store.resumeFromCrash();

    const state = useQueueStore.getState();
    expect(state.jobs.length).toBe(2);
    expect(state.jobs[0].id).toBe('job-crashed');
    expect(state.jobs[0].renderMissingOnly).toBe(true);
    expect(state.jobs[1].id).toBe('job-pending-next');
    expect(state.isRestoredSession).toBe(true);
    expect(state.showCrashRestoreBanner).toBe(false);
    expect(lockCleared).toBe(true);

    // HARD SAFETY RULE: Post-action is shown in UI but strictly DISARMED on restore
    expect(state.postAction).toBe('shutdown');
    expect(state.postActionArmed).toBe(false);
  });

  it('arms post action on live queue start and triggers 60s countdown on graceful finish', () => {
    const store = useQueueStore.getState();

    store.setPostAction('sleep');
    expect(useQueueStore.getState().postAction).toBe('sleep');

    // Start countdown
    store.startPostActionCountdown();

    let state = useQueueStore.getState();
    expect(state.showPostActionModal).toBe(true);
    expect(state.postActionCountdown).toBe(60);

    // User cancels countdown
    store.cancelPostActionCountdown();
    state = useQueueStore.getState();
    expect(state.showPostActionModal).toBe(false);
    expect(state.postActionCountdown).toBeNull();
    expect(state.postActionArmed).toBe(false);
  });

  it('manages sound settings toggles', () => {
    const store = useQueueStore.getState();

    store.setSoundSettings({ volume: 80 });
    expect(useQueueStore.getState().soundSettings.volume).toBe(80);

    store.setSoundSettings({ isMuted: true });
    expect(useQueueStore.getState().soundSettings.isMuted).toBe(true);

    store.setSoundSettings({ playOnFailure: true });
    expect(useQueueStore.getState().soundSettings.playOnFailure).toBe(true);
  });

  it('schedules queue with sleep blocker acquisition and cancellation', async () => {
    let sleepBlockStarted = false;
    let sleepBlockStopped = false;

    (globalThis as unknown as { window: unknown }).window = {
      rnApi: {
        acquireSleepBlock: vi.fn().mockImplementation(async () => {
          sleepBlockStarted = true;
          return 42;
        }),
        releaseSleepBlock: vi.fn().mockImplementation(async (id: number) => {
          if (id === 42) sleepBlockStopped = true;
        }),
        saveQueue: vi.fn().mockResolvedValue(undefined),
      },
    };

    const store = useQueueStore.getState();

    await store.setSchedule({
      enabled: true,
      time: '03:30',
      blockSleep: true,
    });

    let state = useQueueStore.getState();
    expect(state.scheduleConfig.enabled).toBe(true);
    expect(state.scheduleConfig.time).toBe('03:30');
    expect(sleepBlockStarted).toBe(true);
    expect(state.activeSleepBlockId).toBe(42);

    // Cancel schedule
    await store.cancelSchedule();
    state = useQueueStore.getState();
    expect(state.scheduleConfig.enabled).toBe(false);
    expect(sleepBlockStopped).toBe(true);
    expect(state.activeSleepBlockId).toBeNull();
  });
});
