import { expect, test } from "bun:test";
import { assertProperty, fc } from "./test-support.js";
import { consumeFault, enqueueFault, type QueuedFault } from "./effects.js";
import { operationId } from "./ids.js";
import { parseJsonValue } from "./json.js";
import type { JsonValue } from "./json-value.js";

test("property: a queued fault is consumed exactly its configured number of times", () => {
  const jsonValues = fc.jsonValue().map((input): JsonValue => {
    const source = JSON.stringify(input);
    if (source === undefined) throw new Error("JSON values must serialize");
    const parsed = parseJsonValue(JSON.parse(source) as unknown);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return parsed.value;
  });
  assertProperty(fc.property(fc.integer({ min: 1, max: 100 }), jsonValues, (uses, fault) => {
    const id = operationId("fault-000001");
    let queue: readonly QueuedFault<JsonValue>[] = enqueueFault([], id, fault, uses);
    for (let count = 0; count < uses; count += 1) {
      const consumed = consumeFault(queue);
      expect(consumed.kind).toBe("consumed");
      if (consumed.kind !== "consumed") throw new Error("queued fault must be consumed");
      expect(consumed.effect).toEqual(fault);
      queue = consumed.queue;
    }
    expect(queue).toEqual([]);
    expect(consumeFault(queue)).toEqual({ kind: "empty", queue: [] });
  }));
});

test("a consumed JSON null remains distinct from an empty queue", () => {
  const queue = enqueueFault([], operationId("fault-000001"), null);

  expect(consumeFault(queue)).toEqual({ kind: "consumed", effect: null, queue: [] });
  expect(consumeFault([])).toEqual({ kind: "empty", queue: [] });
});

test("forged nonpositive remaining counts fail before decrementing", () => {
  const forged: readonly QueuedFault<string>[] = [{
    id: operationId("fault-000001"),
    effect: "offline",
    remaining: 0,
  }];

  expect(() => consumeFault(forged)).toThrow("positive safe integer");
  expect(forged[0]?.remaining).toBe(0);
});

test("queued effects own and deeply freeze caller data", () => {
  const source = { nested: { value: 1 }, labels: ["initial"] };
  const queue = enqueueFault([], operationId("fault-000001"), source, 1);
  source.nested.value = 9;
  source.labels.push("mutated");

  expect(queue[0]?.effect).toEqual({ nested: { value: 1 }, labels: ["initial"] });
  expect(Object.isFrozen(queue)).toBe(true);
  expect(Object.isFrozen(queue[0]?.effect)).toBe(true);
  expect(Object.isFrozen(queue[0]?.effect.nested)).toBe(true);
  expect(Object.isFrozen(queue[0]?.effect.labels)).toBe(true);
});

test("enqueueing re-owns existing queue entries instead of preserving caller aliases", () => {
  const existingEffect = { nested: { value: 1 } };
  const existing: readonly QueuedFault<typeof existingEffect>[] = [{
    id: operationId("fault-000001"),
    effect: existingEffect,
    remaining: 2,
  }];

  const extended = enqueueFault(
    existing,
    operationId("fault-000002"),
    { nested: { value: 2 } },
  );
  existingEffect.nested.value = 99;

  expect(extended[0]?.effect.nested.value).toBe(1);
  expect(Object.isFrozen(extended[0])).toBe(true);
  expect(Object.isFrozen(extended[0]?.effect.nested)).toBe(true);
});
