import { describe, expect, test } from "bun:test";

import { createDeviceStatusCarapaceSession } from "./session";

function requiredSession(source = "") {
  const created = createDeviceStatusCarapaceSession(source);
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (reason: unknown) {
    return reason instanceof Error ? reason : new Error(String(reason));
  }
  throw new Error("Expected the operation to reject.");
}

describe("deterministic device status port", () => {
  test("returns the active world through an accounted operation", async () => {
    const session = requiredSession();
    const operation = session.product.port.inspect();
    expect(session.product.pendingOperations()).toBe(1);
    expect(await operation).toEqual({
      platform: "ios",
      colorScheme: "light",
      capturedAt: "2026-01-15T14:30:00.000Z",
    });
    expect(session.product.pendingOperations()).toBe(0);
    expect(session.probe.snapshot()).toMatchObject({
      ok: true,
      value: {
        activity: { active: 0 },
        pending: { deviceInspections: 0 },
        violations: { blockedNetworkRequests: 0 },
      },
    });
    session.dispose();
  });

  test("surfaces a declared failure without leaking work", async () => {
    const session = requiredSession("?__carapace_scenario=inspection-failure");
    expect((await rejection(session.product.port.inspect())).message)
      .toContain("The deterministic device inspection is unavailable.");
    expect(session.product.pendingOperations()).toBe(0);
    session.dispose();
  });

  test("cancels in-flight work and rejects use after disposal", async () => {
    const session = requiredSession();
    const operation = session.product.port.inspect();
    session.dispose();
    expect((await rejection(operation)).message).toMatch(/cancelled|aborted|disposed/u);
    expect((await rejection(session.product.port.inspect())).message).toContain("disposed");
    expect(session.isDisposed()).toBeTrue();
    expect(session.disposalErrors()).toEqual([]);
  });

  test("publishes product violations through the canonical probe", () => {
    const session = requiredSession();
    session.product.recordBlockedNetworkRequest();
    expect(session.probe.snapshot()).toMatchObject({
      ok: true,
      value: { violations: { blockedNetworkRequests: 1 } },
    });
    session.dispose();
  });
});
