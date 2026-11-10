import { getOsCommandForAction, PostActionManager } from '../src/core/post-actions';

import { describe, expect, it, vi } from 'vitest';

describe('Post-Queue Power Actions & OS Execution', () => {
  it('generates correct commands for Windows, macOS, and Linux', () => {
    // Windows
    expect(getOsCommandForAction('shutdown', 'win32')).toEqual({
      command: 'shutdown',
      args: ['/s', '/t', '0'],
    });
    expect(getOsCommandForAction('restart', 'win32')).toEqual({
      command: 'shutdown',
      args: ['/r', '/t', '0'],
    });
    expect(getOsCommandForAction('sleep', 'win32')).toEqual({
      command: 'rundll32.exe',
      args: ['powrprof.dll,SetSuspendState', '0,1,0'],
    });
    expect(getOsCommandForAction('hibernate', 'win32')).toEqual({
      command: 'shutdown',
      args: ['/h'],
    });

    // macOS
    expect(getOsCommandForAction('shutdown', 'darwin')).toEqual({
      command: 'osascript',
      args: ['-e', 'tell application "System Events" to shut down'],
    });
    expect(getOsCommandForAction('restart', 'darwin')).toEqual({
      command: 'osascript',
      args: ['-e', 'tell application "System Events" to restart'],
    });
    expect(getOsCommandForAction('sleep', 'darwin')).toEqual({
      command: 'pmset',
      args: ['sleepnow'],
    });

    // Linux
    expect(getOsCommandForAction('shutdown', 'linux')).toEqual({
      command: 'systemctl',
      args: ['poweroff'],
    });
    expect(getOsCommandForAction('restart', 'linux')).toEqual({
      command: 'systemctl',
      args: ['reboot'],
    });
    expect(getOsCommandForAction('sleep', 'linux')).toEqual({
      command: 'systemctl',
      args: ['suspend'],
    });
    expect(getOsCommandForAction('hibernate', 'linux')).toEqual({
      command: 'systemctl',
      args: ['hibernate'],
    });

    // Close app and none
    expect(getOsCommandForAction('close_app', 'linux')).toEqual({
      command: 'close_app',
      args: [],
    });
    expect(getOsCommandForAction('none', 'linux')).toBeNull();
  });

  it('HARD SAFETY RULE: a restored session or crash NEVER triggers post-queue action', async () => {
    const executedCommands: string[] = [];
    const mockRunner = async (cmd: string) => {
      executedCommands.push(cmd);
    };

    const manager = new PostActionManager({
      commandRunner: mockRunner,
    });

    // Simulate restored session from a crashed queue
    // Previously configured action was 'shutdown'
    manager.setAction('shutdown', true /* isRestoredSession */);

    expect(manager.getSelectedAction()).toBe('shutdown');
    // Crucial check: Must NOT be armed!
    expect(manager.getIsArmed()).toBe(false);

    // Call onQueueGracefulComplete as if the crashed state tried to trigger
    const triggered = await manager.onQueueGracefulComplete();

    expect(triggered).toBe(false);
    expect(executedCommands.length).toBe(0);
    expect(manager.getState()).toBe('idle');
  });

  it('executes post action after graceful completion and 60s countdown', async () => {
    vi.useFakeTimers();

    const executedCommands: string[] = [];
    const mockRunner = async (cmd: string, args: string[]) => {
      executedCommands.push(`${cmd} ${args.join(' ')}`);
    };

    const manager = new PostActionManager({
      platform: 'linux',
      commandRunner: mockRunner,
      countdownDurationSeconds: 3, // 3s for fast test
    });

    manager.setAction('shutdown', false);
    expect(manager.getIsArmed()).toBe(true);

    const completionPromise = manager.onQueueGracefulComplete();
    expect(manager.getState()).toBe('countdown');

    // Advance 1 second -> tick
    vi.advanceTimersByTime(1000);
    expect(manager.getSecondsRemaining()).toBe(2);

    // Advance remaining 2 seconds -> execution
    vi.advanceTimersByTime(2000);
    const result = await completionPromise;

    expect(result).toBe(true);
    expect(executedCommands).toContain('systemctl poweroff');
    expect(manager.getState()).toBe('executed');

    vi.useRealTimers();
  });

  it('allows user to cancel the countdown before it executes', async () => {
    vi.useFakeTimers();

    const executedCommands: string[] = [];
    const mockRunner = async (cmd: string) => {
      executedCommands.push(cmd);
    };

    const manager = new PostActionManager({
      commandRunner: mockRunner,
      countdownDurationSeconds: 60,
    });

    manager.setAction('sleep', false);

    const completionPromise = manager.onQueueGracefulComplete();
    expect(manager.getState()).toBe('countdown');

    // Advance 10 seconds into the 60s countdown
    vi.advanceTimersByTime(10000);
    expect(manager.getSecondsRemaining()).toBe(50);

    // User clicks Cancel
    manager.cancelCountdown();

    const result = await completionPromise;
    expect(result).toBe(false);
    expect(executedCommands.length).toBe(0); // Never executed!
    expect(manager.getState()).toBe('cancelled');
    expect(manager.getIsArmed()).toBe(false); // Disarmed!

    vi.useRealTimers();
  });
});
