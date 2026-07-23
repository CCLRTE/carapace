import { expect, test } from "bun:test";

import {
  FIXTURE_SCHEMA,
  parseFixtureJson,
  serializeFixtureJson,
} from "./fixture.js";
import { createScenarioCatalog } from "./scenario.js";
import { parseTestWorld, testScenarios } from "./test-support.js";

test("fixture JSON rejects duplicate keys before exact envelope parsing", () => {
  const options = { scenarios: testScenarios(), parseWorld: parseTestWorld };
  const duplicateSchema = `{
    "schema":"wrong",
    "schema":"${FIXTURE_SCHEMA}",
    "scenario":"chat.empty",
    "route":"/chat",
    "world":{"count":0,"messages":[]}
  }`;
  const duplicateNestedWorld = `{
    "schema":"${FIXTURE_SCHEMA}",
    "scenario":"chat.empty",
    "route":"/chat",
    "world":{"count":99,"count":1,"messages":[]}
  }`;

  expect(parseFixtureJson(duplicateSchema, options)).toMatchObject({
    ok: false,
    error: { code: "duplicate-key" },
  });
  expect(parseFixtureJson(duplicateNestedWorld, options)).toMatchObject({
    ok: false,
    error: { code: "duplicate-key" },
  });
});

test("fixture byte limits apply after an idempotent world parser normalizes defaults", () => {
  type NormalizedWorld = {
    readonly padding?: string;
    readonly payload: string;
  };
  const defaultPadding = "x".repeat(200);
  const parseWorld = (input: unknown): NormalizedWorld => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("World must be an object");
    }
    const record = input as Record<string, unknown>;
    if (typeof record.payload !== "string") throw new Error("World payload must be a string");
    if (record.padding !== undefined && typeof record.padding !== "string") {
      throw new Error("World padding must be a string");
    }
    return {
      padding: record.padding ?? defaultPadding,
      payload: record.payload,
    };
  };
  const scenarios = createScenarioCatalog<NormalizedWorld, "/">([{
    id: "case.ready",
    title: "Ready",
    route: "/",
    world: { payload: "" },
  }], parseWorld);
  if (!scenarios.ok) throw new Error(scenarios.error.message);

  expect(serializeFixtureJson({
    scenario: "case.ready",
    world: { payload: "a" },
  }, {
    scenarios: scenarios.value,
    parseWorld,
    maxBytes: 250,
  })).toMatchObject({ ok: false, error: { code: "oversized-fixture" } });
});
