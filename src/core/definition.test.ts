import { describe, expect, test } from "bun:test";

import { defineCarapace } from "./definition.js";
import { SCENARIO_QUERY_KEY } from "./query.js";
import { parseTestWorld, type TestRoute, type TestWorld } from "./test-support.js";

function definition() {
  return defineCarapace<TestWorld, TestRoute>({
    parseWorld: parseTestWorld,
    defaultScenario: "chat.empty",
    scenarios: [
      {
        id: "chat.empty",
        title: "Empty chat",
        route: "/chat",
        world: { count: 0, messages: [] },
      },
      {
        id: "settings.ready",
        title: "Ready settings",
        route: "/settings",
        world: { count: 1, messages: ["ready"] },
      },
    ],
    coverage: [
      {
        key: "chat.empty",
        mode: "fixture",
        claim: "The empty chat state renders",
        route: "/chat",
        scenarios: ["chat.empty"],
      },
    ],
  });
}

describe("Carapace definition", () => {
  test("validates configuration once and activates the default for an empty query", () => {
    const created = definition();
    if (!created.ok) throw new Error(created.error.message);

    expect(String(created.value.defaultScenario.id)).toBe("chat.empty");
    expect(created.value.coverage.keys().map(String)).toEqual(["chat.empty"]);
    expect(created.value.activate("?tab=recent")).toMatchObject({
      ok: true,
      value: {
        kind: "active",
        source: "scenario",
        scenario: "chat.empty",
        route: "/chat",
        world: { count: 0, messages: [] },
      },
    });
  });

  test("keeps explicit activation fail-closed instead of falling back", () => {
    const created = definition();
    if (!created.ok) throw new Error(created.error.message);

    expect(created.value.activateScenario("settings.ready")).toMatchObject({
      ok: true,
      value: { scenario: "settings.ready", route: "/settings" },
    });
    expect(created.value.activate(`?${SCENARIO_QUERY_KEY}=missing`)).toMatchObject({
      ok: false,
      error: { code: "unknown-scenario" },
    });
  });

  test("rejects an unknown default and coverage drift", () => {
    const unknownDefault = defineCarapace<TestWorld, TestRoute>({
      parseWorld: parseTestWorld,
      defaultScenario: "missing",
      scenarios: [{
        id: "chat.empty",
        title: "Empty chat",
        route: "/chat",
        world: { count: 0, messages: [] },
      }],
      coverage: [],
    });
    expect(unknownDefault).toMatchObject({
      ok: false,
      error: { code: "invalid-default-scenario" },
    });

    const unknownCoverageScenario = defineCarapace<TestWorld, TestRoute>({
      parseWorld: parseTestWorld,
      defaultScenario: "chat.empty",
      scenarios: [{
        id: "chat.empty",
        title: "Empty chat",
        route: "/chat",
        world: { count: 0, messages: [] },
      }],
      coverage: [{
        key: "chat.ready",
        mode: "fixture",
        claim: "Ready chat renders",
        route: "/chat",
        scenarios: ["chat.ready"],
      }],
    });
    expect(unknownCoverageScenario).toMatchObject({
      ok: false,
      error: { code: "invalid-coverage", coverageError: { code: "unknown-scenario" } },
    });
  });

  test("rejects invalid activation limits before accepting the definition", () => {
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
      maxQueryBytes: 0,
    });
    expect(created).toMatchObject({ ok: false, error: { code: "invalid-limits" } });
  });

  test("freezes limits and binds fixture parsing, creation, and serialization to them", () => {
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
      maxFixtureBytes: 256,
      maxQueryBytes: 512,
    });
    if (!created.ok) throw new Error(created.error.message);

    expect(created.value.limits).toEqual({ maxFixtureBytes: 256, maxQueryBytes: 512 });
    expect(Object.isFrozen(created.value.limits)).toBeTrue();
    const serialized = created.value.serializeFixture({
      scenario: "chat.empty",
      world: { count: 1, messages: ["portable"] },
    });
    if (!serialized.ok) throw new Error(serialized.error.message);
    expect(created.value.parseFixtureJson(serialized.value)).toMatchObject({
      ok: true,
      value: { scenario: "chat.empty", route: "/chat", world: { count: 1 } },
    });
    expect(created.value.createFixture({
      scenario: "chat.empty",
      world: { count: 1, messages: ["x".repeat(512)] },
    })).toMatchObject({ ok: false, error: { code: "oversized-fixture" } });
  });
});
