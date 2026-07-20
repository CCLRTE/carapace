import { describe, expect, test } from "bun:test";
import { assertProperty, fc } from "./test-support.js";

import { defineCarapace } from "./definition.js";
import { parseTestWorld, type TestRoute, type TestWorld } from "./test-support.js";

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

describe("Carapace definition properties", () => {
  test("unreserved query parameters cannot perturb the default activation", () => {
    assertProperty(fc.property(
      fc.array(fc.tuple(
        fc.stringMatching(/^[a-z][a-z0-9]{0,12}$/u).filter((key) => !key.startsWith("__")),
        fc.string({ maxLength: 24 }),
      ), { maxLength: 12 }),
      (entries) => {
        const query = new URLSearchParams(entries).toString();
        const activation = created.value.activate(query);
        expect(activation).toMatchObject({
          ok: true,
          value: { scenario: "chat.empty", source: "scenario" },
        });
      },
    ));
  });

  test("foreign scenario identifiers never throw", () => {
    assertProperty(fc.property(fc.anything(), (candidate) => {
      expect(() => created.value.activateScenario(candidate)).not.toThrow();
    }));
  });
});
