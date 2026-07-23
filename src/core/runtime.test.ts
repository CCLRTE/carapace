import { expect, test } from "bun:test";

import {
  LOGICAL_RUNTIME_SCHEMA,
  MAX_HOST_TIMER_MILLISECONDS,
  createLogicalRuntime,
} from "./runtime.js";

test("a wait that would overflow fails before invoking the sleep boundary", async () => {
  let sleepCalls = 0;
  const runtime = createLogicalRuntime({
    schema: LOGICAL_RUNTIME_SCHEMA,
    nowMs: Number.MAX_SAFE_INTEGER - 5,
    nextOperation: 1,
    acceleration: 1,
  }, () => {
    sleepCalls += 1;
    return Promise.resolve();
  });

  expect(await runtime.wait(6)).toEqual({
    ok: false,
    error: { code: "time-overflow", message: "Logical time exceeds the safe integer range" },
  });
  expect(sleepCalls).toBe(0);
  expect(runtime.now()).toBe(Number.MAX_SAFE_INTEGER - 5);
});

test("the default sleep chunks durations beyond the host timer maximum", async () => {
  const runtime = createLogicalRuntime({
    schema: LOGICAL_RUNTIME_SCHEMA,
    nowMs: 0,
    nextOperation: 1,
    acceleration: 1,
  });
  const controller = new AbortController();
  const waiting = runtime.wait(MAX_HOST_TIMER_MILLISECONDS + 1, controller.signal);
  const state = await Promise.race([
    waiting.then(() => "settled" as const),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 25)),
  ]);

  expect(state).toBe("pending");
  controller.abort();
  expect(await waiting).toMatchObject({ ok: false, error: { code: "wait-cancelled" } });
  expect(runtime.now()).toBe(0);
});
