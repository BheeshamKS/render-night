/**
 * Sleep Blocker abstraction for src/core.
 * Keeps reference-counted prevention of system suspension.
 * Zero Electron imports here - driver is injected from main process.
 */

export interface PowerSaveBlockerDriver {
  start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
}

export class SleepBlockerManager {
  private driver: PowerSaveBlockerDriver;
  private refCount = 0;
  private blockerId: number | null = null;

  constructor(driver: PowerSaveBlockerDriver) {
    this.driver = driver;
  }

  public isBlocking(): boolean {
    return this.refCount > 0 && this.blockerId !== null && this.driver.isStarted(this.blockerId);
  }

  public acquire(): () => void {
    this.refCount++;
    if (this.refCount === 1) {
      this.blockerId = this.driver.start('prevent-app-suspension');
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release();
    };
  }

  private release(): void {
    if (this.refCount > 0) {
      this.refCount--;
      if (this.refCount === 0 && this.blockerId !== null) {
        try {
          this.driver.stop(this.blockerId);
        } catch {
          // Ignore
        }
        this.blockerId = null;
      }
    }
  }
}
