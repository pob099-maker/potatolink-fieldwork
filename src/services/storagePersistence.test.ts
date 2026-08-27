import { describe, expect, it } from "vitest";
import {
  describePersistence,
  formatBytes,
  requestPersistence,
  storageReport,
  type StorageLike,
} from "./storagePersistence";

// The failure this guards against is silent, which is why it is worth testing
// rather than trusting: a grower fills a paddock's worth of entries with no
// reception, the phone is nearly full of photographs, the browser reclaims the
// space, and nothing tells anybody.

const storage = (over: Partial<StorageLike> = {}): StorageLike => ({
  persisted: async () => false,
  persist: async () => true,
  estimate: async () => ({ usage: 1024 * 1024, quota: 1024 * 1024 * 1024 }),
  ...over,
});

describe("asking for durable storage", () => {
  it("asks when it has not already been granted", async () => {
    let asked = false;
    const state = await requestPersistence(
      storage({
        persist: async () => {
          asked = true;
          return true;
        },
      }),
    );
    expect(asked).toBe(true);
    expect(state).toBe("persisted");
  });

  it("does not ask again once it has been granted", async () => {
    // Some browsers count a repeated request against the heuristics that
    // decide it, so asking twice can be worse than not asking.
    let asked = false;
    const state = await requestPersistence(
      storage({
        persisted: async () => true,
        persist: async () => {
          asked = true;
          return true;
        },
      }),
    );
    expect(asked).toBe(false);
    expect(state).toBe("persisted");
  });

  it("reports best-effort when the browser says no", async () => {
    expect(await requestPersistence(storage({ persist: async () => false }))).toBe(
      "best-effort",
    );
  });

  it("says so plainly when the browser has never heard of it", async () => {
    expect(await requestPersistence({})).toBe("unsupported");
    expect(await requestPersistence(undefined)).toBe("unsupported");
  });

  it("never throws, because this runs while the app is starting", async () => {
    // Rule 27's reasoning: nothing in the boot path may leave an unsettled
    // promise or an unhandled rejection behind it.
    const angry = storage({
      persisted: async () => {
        throw new Error("no");
      },
    });
    await expect(requestPersistence(angry)).resolves.toBe("best-effort");

    const alsoAngry = storage({
      persist: async () => {
        throw new Error("no");
      },
    });
    await expect(requestPersistence(alsoAngry)).resolves.toBe("best-effort");
  });
});

describe("reporting what is stored", () => {
  it("gives the state alongside the numbers", async () => {
    const report = await storageReport(storage({ persisted: async () => true }));
    expect(report.state).toBe("persisted");
    expect(report.usage).toBe(1024 * 1024);
    expect(report.quota).toBe(1024 * 1024 * 1024);
  });

  it("does not ask for persistence as a side effect of looking", async () => {
    // Reading the settings page must not trigger a permission decision.
    let asked = false;
    await storageReport(
      storage({
        persist: async () => {
          asked = true;
          return true;
        },
      }),
    );
    expect(asked).toBe(false);
  });

  it("returns nulls rather than guesses when the browser will not say", async () => {
    const report = await storageReport({ persisted: async () => false });
    expect(report.usage).toBeNull();
    expect(report.quota).toBeNull();
    expect(report.state).toBe("best-effort");
  });

  it("survives an estimate that throws", async () => {
    const report = await storageReport(
      storage({
        estimate: async () => {
          throw new Error("no");
        },
      }),
    );
    expect(report.usage).toBeNull();
  });
});

describe("saying it in bytes somebody can read", () => {
  it("scales up through the units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe("2.0 GB");
  });

  it("drops the decimal once the number is big enough not to need it", () => {
    expect(formatBytes(1024 * 1024 * 250)).toBe("250 MB");
  });

  it("has nothing to say about nothing", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("what somebody is told", () => {
  it("is about whether their data is safe, not about an API", () => {
    const persisted = describePersistence("persisted");
    expect(persisted.reassuring).toBe(true);
    expect(persisted.heading).toMatch(/safe/i);

    const best = describePersistence("best-effort");
    expect(best.reassuring).toBe(false);
    expect(best.heading).toMatch(/could be cleared/i);
    // And tells them the one thing that actually earns the promise.
    expect(best.detail).toMatch(/home screen/i);
  });

  it("does not pretend to know on a browser that cannot say", () => {
    expect(describePersistence("unsupported").reassuring).toBe(false);
  });
});
