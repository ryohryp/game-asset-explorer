import assert from "node:assert/strict";
import test from "node:test";
import { DebouncedAction, DebounceScheduler } from "../src/core/debouncedAction";

class FakeScheduler implements DebounceScheduler {
  private nextId = 1;
  private callbacks = new Map<number, () => void>();

  schedule(callback: () => void): unknown {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }

  cancel(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  flush(): void {
    const pending = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of pending) {
      callback();
    }
  }

  get size(): number {
    return this.callbacks.size;
  }
}

test("coalesces repeated triggers into one action", () => {
  const scheduler = new FakeScheduler();
  let calls = 0;
  const action = new DebouncedAction(() => { calls += 1; }, 100, scheduler);

  action.trigger();
  action.trigger();
  action.trigger();

  assert.equal(scheduler.size, 1);
  scheduler.flush();
  assert.equal(calls, 1);
});

test("dispose cancels a pending action", () => {
  const scheduler = new FakeScheduler();
  let calls = 0;
  const action = new DebouncedAction(() => { calls += 1; }, 100, scheduler);

  action.trigger();
  action.dispose();

  assert.equal(scheduler.size, 0);
  scheduler.flush();
  assert.equal(calls, 0);
});
