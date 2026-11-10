import type { PostAction } from '../schemas/queue-state';
import {
  defaultCommandRunner,
  getOsCommandForAction,
  type ActionCommandRunner,
} from './post-action-executor';

import { EventEmitter } from 'node:events';

export type PostActionState = 'idle' | 'armed' | 'countdown' | 'executed' | 'cancelled';

export interface PostActionManagerOptions {
  platform?: NodeJS.Platform;
  commandRunner?: ActionCommandRunner;
  countdownDurationSeconds?: number;
}

export class PostActionManager extends EventEmitter {
  private selectedAction: PostAction = 'none';
  private isArmed = false;
  private state: PostActionState = 'idle';
  private countdownTimer: NodeJS.Timeout | null = null;
  private secondsRemaining = 60;
  private options: PostActionManagerOptions;

  constructor(options: PostActionManagerOptions = {}) {
    super();
    this.options = {
      countdownDurationSeconds: 60,
      commandRunner: defaultCommandRunner,
      ...options,
    };
  }

  public getSelectedAction(): PostAction {
    return this.selectedAction;
  }

  public getIsArmed(): boolean {
    return this.isArmed;
  }

  public getState(): PostActionState {
    return this.state;
  }

  public getSecondsRemaining(): number {
    return this.secondsRemaining;
  }

  /**
   * Set and configure post action.
   * HARD SAFETY RULE: If this is a restored session after a crash or force-close,
   * the action is strictly disarmed (isArmed = false). It displays in the dropdown
   * but will NOT execute until the resumed queue is started and completed in the live session.
   */
  public setAction(action: PostAction, isRestoredSession = false): void {
    this.selectedAction = action;
    if (isRestoredSession || action === 'none') {
      this.isArmed = false;
      this.state = 'idle';
    } else {
      this.isArmed = true;
      this.state = 'armed';
    }
    this.emit('action:change', { action: this.selectedAction, isArmed: this.isArmed });
  }

  /**
   * Arm the action for a live queue run.
   */
  public arm(): void {
    if (this.selectedAction !== 'none') {
      this.isArmed = true;
      this.state = 'armed';
    }
  }

  /**
   * Disarm the action (e.g. after a crash, cancellation, or manual disarm).
   */
  public disarm(): void {
    this.isArmed = false;
    this.state = 'idle';
    this.cancelCountdown();
  }

  /**
   * Triggered when the queue completes GRACEFULLY inside a live session.
   * Starts a 60-second visible countdown. If not cancelled, executes the OS command.
   */
  public async onQueueGracefulComplete(): Promise<boolean> {
    // HARD SAFETY RULE: Only execute if armed and not "none"
    if (!this.isArmed || this.selectedAction === 'none') {
      return false;
    }

    this.state = 'countdown';
    this.secondsRemaining = this.options.countdownDurationSeconds ?? 60;

    this.emit('countdown:start', {
      action: this.selectedAction,
      secondsRemaining: this.secondsRemaining,
    });

    return new Promise<boolean>((resolve) => {
      this.countdownTimer = setInterval(async () => {
        this.secondsRemaining--;
        this.emit('countdown:tick', {
          action: this.selectedAction,
          secondsRemaining: this.secondsRemaining,
        });

        if (this.secondsRemaining <= 0) {
          this.clearCountdown();
          this.state = 'executed';
          this.emit('action:executed', { action: this.selectedAction });

          try {
            const runner = this.options.commandRunner || defaultCommandRunner;
            const cmd = getOsCommandForAction(this.selectedAction, this.options.platform);
            if (cmd) {
              await runner(cmd.command, cmd.args);
            }
          } catch (err) {
            this.emit('action:error', {
              action: this.selectedAction,
              error: (err as Error).message,
            });
          }

          resolve(true);
        }
      }, 1000);

      // Listen for local cancellation
      this.once('internal:cancel', () => {
        this.clearCountdown();
        this.state = 'cancelled';
        this.isArmed = false; // Disarmed once cancelled
        this.emit('countdown:cancelled', { action: this.selectedAction });
        resolve(false);
      });
    });
  }

  /**
   * Immediately cancel the countdown.
   */
  public cancelCountdown(): void {
    if (this.state === 'countdown') {
      this.emit('internal:cancel');
    }
  }

  private clearCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
