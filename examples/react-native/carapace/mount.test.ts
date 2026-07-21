import { describe, expect, test } from "bun:test";

import { mountDeviceStatusCarapace } from "./mount";

function requiredMount(source = "") {
  const mounted = mountDeviceStatusCarapace(source);
  if (!mounted.ok) throw new Error(mounted.error.message);
  return mounted.value;
}

describe("React Native Carapace browser mount", () => {
  test("effect cleanup and replay replace a disposed session with a fresh installation", async () => {
    const originalFetch = globalThis.fetch;
    const browserGlobal = globalThis as typeof globalThis & { readonly __carapace?: unknown };

    const first = requiredMount();
    expect(browserGlobal.__carapace).toBeDefined();
    first.dispose();
    first.dispose();
    expect(first.session.isDisposed()).toBeTrue();

    const second = requiredMount();
    expect(second.session).not.toBe(first.session);
    expect(second.session.isDisposed()).toBeFalse();
    expect(await second.session.product.port.inspect()).toEqual({
      platform: "ios",
      colorScheme: "light",
      capturedAt: "2026-01-15T14:30:00.000Z",
    });

    second.dispose();
    expect(second.session.isDisposed()).toBeTrue();
    expect(browserGlobal.__carapace).toBeUndefined();
    expect(globalThis.fetch).toBe(originalFetch);
  });
});
