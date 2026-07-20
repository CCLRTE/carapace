import { describe, expect, test } from "bun:test";

import { createLogicalRuntime } from "../core/runtime.js";
import { createCarapaceStore } from "../core/store.js";
import { parseTestWorld } from "../core/test-support.js";
import { createCarapaceActivityScope } from "./activity.js";

function setup() {
  const store = createCarapaceStore({ count: 0, messages: [] }, parseTestWorld);
  if (!store.ok) throw new Error(store.error.message);
  const runtime = createLogicalRuntime(undefined, () => Promise.resolve());
  return { store: store.value, scope: createCarapaceActivityScope(store.value, runtime) };
}

function hostileThrownValue(): Error {
  return new Proxy(new Error("hostile"), {
    get: () => {
      throw new Error("property access is forbidden");
    },
    getPrototypeOf: () => {
      throw new Error("prototype access is forbidden");
    },
  });
}

describe("Carapace activity scope", () => {
  test("leases begin once and release idempotently", () => {
    const { store, scope } = setup();
    const started = scope.begin("fetch");
    if (!started.ok) throw new Error(started.error.message);
    expect(store.getSnapshot().activity).toEqual({ active: 1, started: 1, settled: 0 });

    const first = started.value.release();
    const second = started.value.release();
    expect(first).toBe(second);
    expect(first).toEqual({ ok: true, value: true });
    expect(started.value.isReleased()).toBe(true);
    expect(store.getSnapshot().activity).toEqual({ active: 0, started: 1, settled: 1 });
  });

  test("run returns values and retains thrown work errors", async () => {
    const { store, scope } = setup();
    expect(await scope.run("load", () => 42)).toEqual({ ok: true, value: 42 });
    const failure = new Error("adapter failed");
    const failed = await scope.run("load", () => {
      throw failure;
    });
    expect(failed).toMatchObject({
      ok: false,
      error: { code: "work-failed", workError: failure, activityError: null },
    });
    expect(store.getSnapshot().activity).toEqual({ active: 0, started: 2, settled: 2 });
  });

  test("run reports both work and stale-generation settlement failures", async () => {
    const { store, scope } = setup();
    const failure = new Error("request failed");
    const result = await scope.run("request", () => {
      const reset = store.reset({ count: 1, messages: [] });
      if (!reset.ok) throw new Error(reset.error.message);
      throw failure;
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "work-and-settlement-failed",
        workError: failure,
        activityError: { code: "store-settle-failed", storeError: { code: "stale-generation" } },
      },
    });
    expect(store.getSnapshot().activity.active).toBe(0);
  });

  test("hostile thrown values cannot escape the Promise<Result> boundary", async () => {
    const { store, scope } = setup();
    const hostile = hostileThrownValue();
    const failed = await scope.run("hostile", () => Promise.reject(hostile));
    expect(failed).toMatchObject({
      ok: false,
      error: { code: "work-failed", message: "Unknown failure", workError: hostile },
    });

    const combined = await scope.run("hostile", () => {
      const reset = store.reset({ count: 2, messages: [] });
      if (!reset.ok) return Promise.reject(new Error(reset.error.message));
      return Promise.reject(hostile);
    });
    expect(combined).toMatchObject({
      ok: false,
      error: {
        code: "work-and-settlement-failed",
        message: "Unknown failure; settlement failed: Generation 1 is stale; current generation is 2",
        workError: hostile,
      },
    });
  });

  test("invalid operation namespaces fail before touching the store", () => {
    const { store, scope } = setup();
    expect(scope.begin("Not Valid")).toMatchObject({
      ok: false,
      error: { code: "operation-id-failed", operation: null },
    });
    expect(store.getSnapshot().activity).toEqual({ active: 0, started: 0, settled: 0 });
  });
});
