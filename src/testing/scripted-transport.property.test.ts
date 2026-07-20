import { expect, test } from "bun:test";
import { assertAsyncProperty, assertProperty, fc } from "../core/test-support.js";
import type { JsonObject } from "../core/json-value.js";
import { isRecord } from "../core/result.js";

import { createLogicalRuntime } from "../core/runtime.js";
import { DEFAULT_SCRIPTED_TRANSPORT_LIMITS, createExactScriptedTransport } from "./scripted-transport.js";

interface IdRequest extends JsonObject {
  readonly id: number;
}

function parseId(input: unknown): IdRequest {
  if (!isRecord(input) || !Number.isSafeInteger(input.id)) throw new Error("Invalid id");
  return { id: input.id as number };
}

function parseBoolean(input: unknown): boolean {
  if (typeof input !== "boolean") throw new Error("Invalid boolean");
  return input;
}

function parseString(input: unknown): string {
  if (typeof input !== "string") throw new Error("Invalid string");
  return input;
}

test("property: matching concurrent requests conserve steps, activity, and logical delay", async () => {
  await assertAsyncProperty(fc.asyncProperty(
    fc.array(fc.integer({ min: 0, max: 1_000 }), { maxLength: 40 }),
    async (delays) => {
      const runtime = createLogicalRuntime(undefined, () => Promise.resolve());
      const transport = createExactScriptedTransport({
        runtime,
        parseRequest: parseId,
        parseResponse: parseBoolean,
        parseEvent: parseString,
        parseFailure: parseString,
        steps: delays.map((delayMs, id) => ({
          request: { id },
          outcome: { kind: "response", value: true },
          delayMs,
          eventsAfter: [`done-${String(id)}`],
        })),
      });
      if (!transport.ok) throw new Error(transport.error.message);
      const results = await Promise.all(delays.map((_delay, id) => transport.value.request({ id })));
      expect(results.every((result) => result.ok)).toBe(true);
      expect(await transport.value.whenIdle()).toEqual({ ok: true, value: true });
      expect(transport.value.assertDrained()).toEqual({ ok: true, value: true });
      expect(transport.value.pendingDeliveries()).toBe(0);
      expect(transport.value.remainingSteps()).toBe(0);
      expect(runtime.now()).toBe(delays.reduce((sum, delay) => sum + delay, 0));
    },
  ));
});

test("property: every invalid request is retained as a drain violation", async () => {
  await assertAsyncProperty(fc.asyncProperty(
    fc.array(fc.oneof(fc.string(), fc.double(), fc.boolean(), fc.constant(null)), { minLength: 1, maxLength: 40 }),
    async (invalidRequests) => {
      const transport = createExactScriptedTransport({
        runtime: createLogicalRuntime(undefined, () => Promise.resolve()),
        parseRequest: parseId,
        parseResponse: parseBoolean,
        parseEvent: parseString,
        parseFailure: parseString,
        steps: [],
      });
      if (!transport.ok) throw new Error(transport.error.message);
      for (const candidate of invalidRequests) {
        expect((await transport.value.request(candidate)).ok).toBe(false);
      }
      expect(transport.value.violationCount()).toBe(invalidRequests.length);
      expect(transport.value.assertDrained()).toMatchObject({ ok: false, error: { code: "internal-failure" } });
    },
  ));
});

test("property: scripts are accepted exactly within combined event and logical-delay budgets", () => {
  assertProperty(fc.property(
    fc.array(fc.record({
      delayMs: fc.integer({ min: 0, max: 50 }),
      eventsBefore: fc.integer({ min: 0, max: 10 }),
      eventsAfter: fc.integer({ min: 0, max: 10 }),
    }), { maxLength: 20 }),
    fc.integer({ min: 0, max: 50 }),
    fc.integer({ min: 0, max: 500 }),
    fc.integer({ min: 1, max: 20 }),
    (inputs, maxPerStep, maxTotal, maxEvents) => {
      const steps = inputs.map((input, id) => ({
        request: { id },
        outcome: { kind: "response", value: true },
        delayMs: input.delayMs,
        eventsBefore: Array.from({ length: input.eventsBefore }, () => "before"),
        eventsAfter: Array.from({ length: input.eventsAfter }, () => "after"),
      }));
      const transport = createExactScriptedTransport({
        runtime: createLogicalRuntime(undefined, () => Promise.resolve()),
        parseRequest: parseId,
        parseResponse: parseBoolean,
        parseEvent: parseString,
        parseFailure: parseString,
        steps,
        limits: {
          ...DEFAULT_SCRIPTED_TRANSPORT_LIMITS,
          maxLogicalDelayPerStepMs: maxPerStep,
          maxTotalLogicalDelayMs: maxTotal,
          maxEventsPerStep: maxEvents,
        },
      });
      let total = 0;
      const expected = inputs.every((input) => {
        const within = input.delayMs <= maxPerStep
          && total <= maxTotal - input.delayMs
          && input.eventsBefore + input.eventsAfter <= maxEvents;
        total += input.delayMs;
        return within;
      });
      expect(transport.ok).toBe(expected);
    },
  ));
});
