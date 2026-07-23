import { describe, expect, test } from "bun:test";
import {
  FIXTURE_SCHEMA,
  LOGICAL_RUNTIME_SCHEMA,
  consumeFault,
  coverageKey,
  createCoverageCatalog,
  createFixtureEnvelope,
  createLogicalRuntime,
  enqueueFault,
  operationId,
  parseFixtureEnvelope,
  parseOperationId,
  parseScenarioId,
  scenarioId,
  serializeFixtureJson,
} from "./index.js";
import { parseTestWorld, testScenarios } from "./test-support.js";

describe("strict identifiers", () => {
  test("accepts separated lowercase identifiers and rejects ambiguous text", () => {
    const parsed = parseScenarioId("chat.empty");
    expect(parsed.ok ? String(parsed.value) : null).toBe("chat.empty");
    expect(parseOperationId("chat-send-000001").ok).toBe(true);
    expect(parseScenarioId("Chat Empty").ok).toBe(false);
    expect(() => scenarioId("chat empty")).toThrow();
  });
});

describe("logical runtime", () => {
  test("restores its serialized clock and operation sequence", () => {
    const runtime = createLogicalRuntime({
      schema: LOGICAL_RUNTIME_SCHEMA,
      nowMs: 42,
      nextOperation: 7,
      acceleration: 500,
    }, () => Promise.resolve());

    expect(String(runtime.nextOperationId("send"))).toBe("send-000007");
    expect(runtime.advance(8)).toEqual({ ok: true, value: 50 });
    expect(runtime.snapshot()).toEqual({
      schema: LOGICAL_RUNTIME_SCHEMA,
      nowMs: 50,
      nextOperation: 8,
      acceleration: 500,
    });
  });

  test("cancels an active wait without advancing logical time", async () => {
    let observedSignal: AbortSignal | undefined;
    const runtime = createLogicalRuntime(undefined, (_wallMilliseconds, signal) => {
      observedSignal = signal;
      return new Promise((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
    });
    const controller = new AbortController();
    const waiting = runtime.wait(5_000, controller.signal);
    await Promise.resolve();
    controller.abort();

    expect(observedSignal).toBe(controller.signal);
    expect(await waiting).toEqual({
      ok: false,
      error: { code: "wait-cancelled", message: "Logical wait was cancelled" },
    });
    expect(runtime.now()).toBe(0);
  });
});

describe("fixture envelopes", () => {
  test("uses the catalog runtime and rejects unknown keys and route mismatches", () => {
    const options = { scenarios: testScenarios(), parseWorld: parseTestWorld };
    const valid = parseFixtureEnvelope({
      schema: FIXTURE_SCHEMA,
      scenario: "chat.empty",
      route: "/chat",
      world: { count: 3, messages: ["fixture"] },
    }, options);
    expect(valid.ok).toBe(true);

    const unknownKey = parseFixtureEnvelope({
      schema: FIXTURE_SCHEMA,
      scenario: "chat.empty",
      route: "/chat",
      world: { count: 0, messages: [] },
      surprise: true,
    }, options);
    expect(unknownKey).toMatchObject({ ok: false, error: { code: "unknown-key" } });

    const mismatched = parseFixtureEnvelope({
      schema: FIXTURE_SCHEMA,
      scenario: "chat.empty",
      route: "/settings",
      world: { count: 0, messages: [] },
    }, options);
    expect(mismatched).toMatchObject({ ok: false, error: { code: "mismatched-route" } });
  });

  test("creates portable fixtures with catalog-derived routes and canonical JSON", () => {
    const options = { scenarios: testScenarios(), parseWorld: parseTestWorld };
    const created = createFixtureEnvelope({
      scenario: "chat.empty",
      world: { messages: ["portable"], count: 2 },
    }, options);
    expect(created).toMatchObject({
      ok: true,
      value: {
        schema: FIXTURE_SCHEMA,
        scenario: "chat.empty",
        route: "/chat",
        world: { count: 2, messages: ["portable"] },
      },
    });
    const serialized = serializeFixtureJson({
      scenario: "chat.empty",
      world: { messages: ["portable"], count: 2 },
    }, options);
    if (!serialized.ok) throw new Error(serialized.error.message);
    expect(parseFixtureEnvelope(JSON.parse(serialized.value), options)).toEqual(created);
    expect(createFixtureEnvelope({
      scenario: "settings.ready",
      world: { count: 1, messages: ["ready"] },
    }, options)).toMatchObject({ ok: true, value: { route: "/settings" } });
  });
});

describe("queued faults", () => {
  test("consumes the first matching fault for its declared number of uses", () => {
    const id = operationId("network-000001");
    const queue = enqueueFault([], id, "offline", 2);
    const first = consumeFault(queue, (entry) => entry.id === id);
    const second = consumeFault(first.queue, (entry) => entry.id === id);
    const exhausted = consumeFault(second.queue, (entry) => entry.id === id);

    expect(first).toMatchObject({ kind: "consumed", effect: "offline" });
    expect(first.queue[0]?.remaining).toBe(1);
    expect(second).toMatchObject({ kind: "consumed", effect: "offline" });
    expect(second.queue).toEqual([]);
    expect(exhausted).toEqual({ kind: "empty", queue: [] });
  });
});

describe("coverage catalog", () => {
  test("rejects duplicates and requires an exact declared key set", () => {
    const duplicate = createCoverageCatalog([
      { key: "chat.empty", mode: "fixture", claim: "Empty state renders", scenarios: ["chat.empty"] },
      { key: "chat.empty", mode: "direct", claim: "Native lifecycle works", scenarios: [] },
    ], testScenarios());
    expect(duplicate).toMatchObject({ ok: false, error: { code: "duplicate-coverage" } });

    const catalog = createCoverageCatalog([
      { key: "chat.empty", mode: "fixture", claim: "Empty state renders", scenarios: ["chat.empty"] },
      { key: "native.lifecycle", mode: "direct", claim: "Native lifecycle works", scenarios: [] },
    ], testScenarios());
    if (!catalog.ok) {
      throw new Error(catalog.error.message);
    }
    expect(catalog.value.requireExactKeys([coverageKey("chat.empty"), "native.lifecycle"])).toEqual({ ok: true, value: true });
    expect(catalog.value.requireExactKeys(["chat.empty"])).toMatchObject({
      ok: false,
      error: { code: "unexpected-coverage", keys: ["native.lifecycle"] },
    });
  });
});
