import type { PostAction } from '../schemas/queue-state';

import { spawn } from 'node:child_process';

export interface ActionCommand {
  command: string;
  args: string[];
}

export type ActionCommandRunner = (command: string, args: string[]) => Promise<void>;

export function getOsCommandForAction(
  action: PostAction,
  platform: NodeJS.Platform = process.platform,
): ActionCommand | null {
  if (action === 'none') {
    return null;
  }

  if (action === 'close_app') {
    return { command: 'close_app', args: [] };
  }

  if (platform === 'win32') {
    switch (action) {
      case 'shutdown':
        return { command: 'shutdown', args: ['/s', '/t', '0'] };
      case 'restart':
        return { command: 'shutdown', args: ['/r', '/t', '0'] };
      case 'sleep':
        return { command: 'rundll32.exe', args: ['powrprof.dll,SetSuspendState', '0,1,0'] };
      case 'hibernate':
        return { command: 'shutdown', args: ['/h'] };
      default:
        return null;
    }
  }

  if (platform === 'darwin') {
    switch (action) {
      case 'shutdown':
        return {
          command: 'osascript',
          args: ['-e', 'tell application "System Events" to shut down'],
        };
      case 'restart':
        return {
          command: 'osascript',
          args: ['-e', 'tell application "System Events" to restart'],
        };
      case 'sleep':
      case 'hibernate':
        return { command: 'pmset', args: ['sleepnow'] };
      default:
        return null;
    }
  }

  // Linux and other Unix-like OSes
  switch (action) {
    case 'shutdown':
      return { command: 'systemctl', args: ['poweroff'] };
    case 'restart':
      return { command: 'systemctl', args: ['reboot'] };
    case 'sleep':
      return { command: 'systemctl', args: ['suspend'] };
    case 'hibernate':
      return { command: 'systemctl', args: ['hibernate'] };
    default:
      return null;
  }
}

export const defaultCommandRunner: ActionCommandRunner = (command, args) => {
  return new Promise((resolve, reject) => {
    if (command === 'close_app') {
      resolve();
      return;
    }

    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${command} exited with code ${code}`));
    });
  });
};

export async function executeOsPostAction(
  action: PostAction,
  platform: NodeJS.Platform = process.platform,
  runner: ActionCommandRunner = defaultCommandRunner,
): Promise<{ success: boolean; error?: string }> {
  const cmd = getOsCommandForAction(action, platform);
  if (!cmd) return { success: true };
  try {
    await runner(cmd.command, cmd.args);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
