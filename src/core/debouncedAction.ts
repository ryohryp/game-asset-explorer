export interface DebounceScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

const defaultScheduler: DebounceScheduler = {
  schedule(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  cancel(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export class DebouncedAction {
  private handle: unknown | undefined;

  constructor(
    private readonly action: () => void,
    private readonly delayMs: number,
    private readonly scheduler: DebounceScheduler = defaultScheduler,
  ) {}

  trigger(): void {
    this.cancelPending();
    this.handle = this.scheduler.schedule(() => {
      this.handle = undefined;
      this.action();
    }, this.delayMs);
  }

  dispose(): void {
    this.cancelPending();
  }

  private cancelPending(): void {
    if (this.handle === undefined) {
      return;
    }

    this.scheduler.cancel(this.handle);
    this.handle = undefined;
  }
}
