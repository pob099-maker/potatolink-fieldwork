import { describe, expect, it } from "vitest";
import { staffGate } from "./staffAccess";

describe("staffGate", () => {
  it("lets a signed-in person through", () => {
    expect(staffGate({ required: true, signedIn: true, ready: true })).toBe("open");
  });

  it("asks anyone else to sign in", () => {
    expect(staffGate({ required: true, signedIn: false, ready: true })).toBe("sign-in");
  });

  it("waits rather than flashing a sign-in screen at someone already signed in", () => {
    // The stored session is read asynchronously. Demanding credentials in that
    // gap is the difference between a smooth return and looking broken.
    expect(staffGate({ required: true, signedIn: false, ready: false })).toBe("waiting");
  });

  it("stays open where the gate is switched off, signed in or not", () => {
    // This is the way back in if sign-in ever fails in the field.
    expect(staffGate({ required: false, signedIn: false, ready: false })).toBe("open");
    expect(staffGate({ required: false, signedIn: false, ready: true })).toBe("open");
  });
});
