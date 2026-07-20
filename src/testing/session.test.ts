import { describe, expect, test } from "bun:test";

import { defineCarapace } from "../core/definition.js";
import { SCENARIO_QUERY_KEY } from "../core/query.js";
import { parseTestWorld, type TestRoute, type TestWorld } from "../core/test-support.js";
import {
  createCarapaceSession,
  type CarapaceSessionCleanup,
  type CarapaceSessionObservation,
} from "./session.js";

function definition() {
  const created = defineCarapace<TestWorld, TestRoute>({
    parseWorld: parseTestWorld,
    defaultScenario: "chat.empty",
    scenarios: [{
      id: "chat.empty",
      title: "Empty chat",
      route: "/chat",
      world: { count: 0, messages: [] },
    }],
    coverage: [],
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

describe("Carapace session", () => {
  test("owns activation, clock, activity, product observation, and teardown", () => {
    const cleanup: string[] = [];
    let pending = 1;
    const created = createCarapaceSession({
      definition: definition(),
      activation: { kind: "query", source: "" },
      create: (context) => {
        context.onDispose(() => { cleanup.push("first"); });
        context.onDispose(() => { cleanup.push("second"); });
        return { count: context.world.count };
      },
      observe: () => ({
        pending: [{ name: "requests", read: () => pending }],
        readRemainingWork: () => ({ queued: pending }),
      }),
    });
    if (!created.ok) throw new Error(created.error.message);

    expect(String(created.value.activation.scenario)).toBe("chat.empty");
    expect(created.value.clock.now()).toBe(0);
    expect(created.value.product).toEqual({ count: 0 });
    expect(created.value.probe.isQuiescent()).toEqual({ ok: true, value: false });
    pending = 0;
    expect(created.value.probe.snapshot()).toMatchObject({
      ok: true,
      value: { isQuiescent: true, remainingWork: { queued: 0 } },
    });

    created.value.dispose();
    created.value.dispose();
    expect(created.value.signal.aborted).toBeTrue();
    expect(created.value.isDisposed()).toBeTrue();
    expect(cleanup).toEqual(["second", "first"]);
    expect(created.value.disposalErrors()).toEqual([]);
  });

  test("does not construct a product after invalid activation", () => {
    let constructions = 0;
    const created = createCarapaceSession({
      definition: definition(),
      activation: { kind: "query", source: `?${SCENARIO_QUERY_KEY}=missing` },
      create: () => {
        constructions += 1;
        return {};
      },
      observe: () => ({}),
    });
    expect(created).toMatchObject({ ok: false, error: { code: "activation-failed" } });
    expect(constructions).toBe(0);
  });

  test("aborts and unwinds registered cleanup when product construction fails", () => {
    const cleanup: string[] = [];
    let aborted = false;
    const created = createCarapaceSession({
      definition: definition(),
      activation: { kind: "scenario", scenario: "chat.empty" },
      create: (context) => {
        context.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
        context.onDispose(() => { cleanup.push("cleaned"); });
        throw new Error("adapter unavailable");
      },
      observe: () => ({}),
    });
    expect(created).toMatchObject({
      ok: false,
      error: { code: "product-failed", message: "adapter unavailable", cleanupErrors: [] },
    });
    expect(aborted).toBeTrue();
    expect(cleanup).toEqual(["cleaned"]);
  });

  test("records cleanup failures while still running every callback", () => {
    const cleanup: string[] = [];
    const created = createCarapaceSession({
      definition: definition(),
      activation: { kind: "query", source: "" },
      create: (context) => {
        context.onDispose(() => { cleanup.push("last"); });
        context.onDispose(() => { throw new Error("cleanup failed"); });
        context.onDispose(() => { cleanup.push("first"); });
        return {};
      },
    });
    if (!created.ok) throw new Error(created.error.message);
    created.value.dispose();
    expect(cleanup).toEqual(["first", "last"]);
    expect(created.value.disposalErrors()).toEqual(["cleanup failed"]);
  });

  test("supports programmatic scenario activation without an observation adapter", () => {
    const created = createCarapaceSession({
      definition: definition(),
      activation: { kind: "scenario", scenario: "chat.empty" },
      create: (context) => ({ route: context.activation.route }),
    });
    if (!created.ok) throw new Error(created.error.message);

    expect(created.value.product).toEqual({ route: "/chat" });
    expect(created.value.probe.snapshot()).toMatchObject({
      ok: true,
      value: { isQuiescent: true },
    });
  });

  test("fails closed on asynchronous construction and reports asynchronous cleanup", () => {
    const product = createCarapaceSession({
      definition: definition(),
      activation: { kind: "scenario", scenario: "chat.empty" },
      create: () => Promise.resolve({}),
    });
    expect(product).toMatchObject({
      ok: false,
      error: {
        code: "product-failed",
        message: "Carapace product construction must complete synchronously",
      },
    });

    const observation = createCarapaceSession({
      definition: definition(),
      activation: { kind: "scenario", scenario: "chat.empty" },
      create: () => ({}),
      observe: (() => Promise.resolve({})) as unknown as () => CarapaceSessionObservation,
    });
    expect(observation).toMatchObject({
      ok: false,
      error: {
        code: "observation-failed",
        message: "Carapace observation construction must complete synchronously",
      },
    });

    const cleanup = createCarapaceSession({
      definition: definition(),
      activation: { kind: "scenario", scenario: "chat.empty" },
      create: (context) => {
        context.onDispose((() => Promise.resolve()) as unknown as CarapaceSessionCleanup);
        return {};
      },
    });
    if (!cleanup.ok) throw new Error(cleanup.error.message);
    cleanup.value.dispose();
    expect(cleanup.value.disposalErrors()).toEqual([
      "Carapace cleanup must complete synchronously and return undefined",
    ]);
  });
});
