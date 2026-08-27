import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The reload button was dead, and dead in the worst way: it failed precisely
// when the update had gone smoothly.
//
// The worker calls skipWaiting during install, so it usually activates before
// anybody has finished reading the banner — and controllerchange fires then,
// not on the click. applyUpdate waited for that event anyway, so clicking
// registered a listener for something that had already happened and posted
// SKIP_WAITING to a worker that was no longer waiting. Nothing at all.
//
// These tests describe the one rule that matters: a click always ends in a
// reload. Every path, every ordering, worker or no worker.

const listeners = new Map<string, Set<EventListener>>();

function fire(type: string): void {
  for (const listener of [...(listeners.get(type) ?? [])]) listener(new Event(type));
}

let reloads = 0;
let posted: unknown[] = [];

/** A worker in a given state, as the page sees it through the registration. */
function worker(state: string) {
  return {
    state,
    postMessage: (message: unknown) => posted.push(message),
    addEventListener: () => {},
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  listeners.clear();
  reloads = 0;
  posted = [];

  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: {},
      addEventListener: (type: string, listener: EventListener) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: () => {},
    },
  });
  vi.stubGlobal("window", {
    location: {
      reload: () => {
        reloads += 1;
      },
    },
    setTimeout: ((fn: () => void, ms: number) => setTimeout(fn, ms)) as typeof setTimeout,
    addEventListener: () => {},
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the reload button", () => {
  it("reloads when no worker was ever announced", async () => {
    const { applyUpdate } = await import("./appUpdate");
    applyUpdate();
    expect(reloads).toBe(1);
  });

  it("reloads at once when the worker has already taken over", async () => {
    // The common case, and the one that used to hang: skipWaiting ran during
    // install, the worker is active, and controllerchange fired long before
    // anybody clicked anything.
    const { applyUpdate, __setWaitingForTest } = (await import("./appUpdate")) as never as {
      applyUpdate: () => void;
      __setWaitingForTest: (w: unknown) => void;
    };
    __setWaitingForTest(worker("activated"));
    applyUpdate();
    expect(reloads).toBe(1);
    expect(posted).toEqual([]);
  });

  it("nudges a worker that really is still waiting", async () => {
    const { applyUpdate, __setWaitingForTest } = (await import("./appUpdate")) as never as {
      applyUpdate: () => void;
      __setWaitingForTest: (w: unknown) => void;
    };
    __setWaitingForTest(worker("installed"));
    applyUpdate();
    expect(posted).toEqual(["SKIP_WAITING"]);
  });

  it("reloads as soon as the new worker takes over", async () => {
    const { applyUpdate, __setWaitingForTest } = (await import("./appUpdate")) as never as {
      applyUpdate: () => void;
      __setWaitingForTest: (w: unknown) => void;
    };
    __setWaitingForTest(worker("installed"));
    applyUpdate();
    expect(reloads).toBe(0);
    fire("controllerchange");
    expect(reloads).toBe(1);
  });

  it("reloads anyway when controllerchange never comes", async () => {
    // The guarantee. Whatever the worker does or fails to do, the button works.
    const { applyUpdate, __setWaitingForTest } = (await import("./appUpdate")) as never as {
      applyUpdate: () => void;
      __setWaitingForTest: (w: unknown) => void;
    };
    __setWaitingForTest(worker("installed"));
    applyUpdate();
    expect(reloads).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(reloads).toBe(1);
  });

  it("reloads once, not twice, when both the event and the timeout land", async () => {
    const { applyUpdate, __setWaitingForTest } = (await import("./appUpdate")) as never as {
      applyUpdate: () => void;
      __setWaitingForTest: (w: unknown) => void;
    };
    __setWaitingForTest(worker("installed"));
    applyUpdate();
    fire("controllerchange");
    vi.advanceTimersByTime(2000);
    fire("controllerchange");
    expect(reloads).toBe(1);
  });
});
