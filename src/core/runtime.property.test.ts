import { expect, test } from "bun:test";
import { assertAsyncProperty, assertProperty, fc } from "./test-support.js";
import { LOGICAL_RUNTIME_SCHEMA, createLogicalRuntime, parseLogicalRuntimeSnapshot } from "./runtime.js";

test("property: logical runtime snapshots survive a JSON round trip", () => {
  assertProperty(fc.property(
    fc.integer({ min: 0, max: 1_000_000 }),
    fc.integer({ min: 1, max: 1_000_000 }),
    fc.integer({ min: 1, max: 1_000_000 }),
    (nowMs, nextOperation, acceleration) => {
      const snapshot = {
        schema: LOGICAL_RUNTIME_SCHEMA,
        nowMs,
        nextOperation,
        acceleration,
      };
      expect(parseLogicalRuntimeSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown)).toEqual({
        ok: true,
        value: snapshot,
      });
    },
  ));
});

test("property: queued waits conserve logical time regardless of acceleration", async () => {
  await assertAsyncProperty(fc.asyncProperty(
    fc.array(fc.integer({ min: 0, max: 10_000 }), { maxLength: 30 }),
    fc.integer({ min: 1, max: 1_000_000 }),
    async (durations, acceleration) => {
      const runtime = createLogicalRuntime({
        schema: LOGICAL_RUNTIME_SCHEMA,
        nowMs: 0,
        nextOperation: 1,
        acceleration,
      }, () => Promise.resolve());
      const results = await Promise.all(durations.map((duration) => runtime.wait(duration)));
      expect(results.every((result) => result.ok)).toBe(true);
      expect(runtime.now()).toBe(durations.reduce((sum, duration) => sum + duration, 0));
    },
  ));
});

test("property: waits sleep exactly once iff their target time is representable and positive", async () => {
  await assertAsyncProperty(fc.asyncProperty(
    fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    async (nowMs, duration) => {
      let sleepCalls = 0;
      const runtime = createLogicalRuntime({
        schema: LOGICAL_RUNTIME_SCHEMA,
        nowMs,
        nextOperation: 1,
        acceleration: 1_000_000,
      }, () => {
        sleepCalls += 1;
        return Promise.resolve();
      });
      const expected = nowMs + duration;
      const representable = Number.isSafeInteger(expected);
      const result = await runtime.wait(duration);

      expect(sleepCalls).toBe(representable && duration > 0 ? 1 : 0);
      if (representable) {
        expect(result).toEqual({ ok: true, value: expected });
        expect(runtime.now()).toBe(expected);
      } else {
        expect(result).toMatchObject({ ok: false, error: { code: "time-overflow" } });
        expect(runtime.now()).toBe(nowMs);
      }
    },
  ));
});
