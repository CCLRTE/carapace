import { describe, expect, test } from "bun:test";
import { assertProperty, fc } from "../core/test-support.js";

import { defineCarapace } from "../core/definition.js";
import { parseTestWorld, type TestRoute, type TestWorld } from "../core/test-support.js";
import { createCarapaceSession } from "./session.js";

const definition = defineCarapace<TestWorld, TestRoute>({
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
if (!definition.ok) throw new Error(definition.error.message);

describe("Carapace session properties", () => {
  test("disposal runs each registered cleanup exactly once in reverse order", () => {
    assertProperty(fc.property(
      fc.array(fc.integer(), { maxLength: 100 }),
      fc.integer({ min: 1, max: 10 }),
      (values, disposeCalls) => {
        const observed: number[] = [];
        const created = createCarapaceSession({
          definition: definition.value,
          activation: { kind: "query", source: "" },
          create: (context) => {
            for (const value of values) context.onDispose(() => { observed.push(value); });
            return {};
          },
          observe: () => ({}),
        });
        if (!created.ok) throw new Error(created.error.message);
        for (let index = 0; index < disposeCalls; index += 1) created.value.dispose();
        expect(observed).toEqual([...values].reverse());
      },
    ));
  });
});
