import { expect, test } from "bun:test";
import { assertProperty, fc } from "./test-support.js";
import { consumeFault, enqueueFault, type QueuedFault } from "./effects.js";
import { operationId } from "./ids.js";

test("property: a queued fault is consumed exactly its configured number of times", () => {
  assertProperty(fc.property(fc.integer({ min: 1, max: 100 }), fc.string(), (uses, fault) => {
    const id = operationId("fault-000001");
    let queue: readonly QueuedFault<string>[] = enqueueFault([], id, fault, uses);
    for (let count = 0; count < uses; count += 1) {
      const consumed = consumeFault(queue);
      expect(consumed.effect).toBe(fault);
      queue = consumed.queue;
    }
    expect(queue).toEqual([]);
    expect(consumeFault(queue)).toEqual({ effect: null, queue: [] });
  }));
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
