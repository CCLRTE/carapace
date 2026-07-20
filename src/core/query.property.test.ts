import { expect, test } from "bun:test";
import { assertProperty, fc } from "./test-support.js";
import { SCENARIO_QUERY_KEY, parseCarapaceQuery } from "./query.js";
import { parseFixtureEnvelope, parseFixtureJson, serializeFixtureJson } from "./fixture.js";
import { parseTestWorld, testScenarios } from "./test-support.js";

test("property: query and fixture parsers are total over arbitrary input", () => {
  assertProperty(fc.property(fc.string(), fc.anything({ withBigInt: true }), (query, fixture) => {
    const options = { scenarios: testScenarios(), parseWorld: parseTestWorld };
    expect(() => parseCarapaceQuery(query, options)).not.toThrow();
    expect(() => parseFixtureEnvelope(fixture, options)).not.toThrow();
  }));
});

test("property: duplicate activation parameters are rejected regardless of their values", () => {
  assertProperty(fc.property(fc.string(), fc.string(), (first, second) => {
    const options = { scenarios: testScenarios(), parseWorld: parseTestWorld };
    const query = `?${SCENARIO_QUERY_KEY}=${encodeURIComponent(first)}&x=kept&${SCENARIO_QUERY_KEY}=${encodeURIComponent(second)}`;
    expect(parseCarapaceQuery(query, options)).toMatchObject({
      ok: false,
      error: { code: "duplicate-parameter" },
    });
  }));
});

test("property: created fixtures survive their canonical JSON round trip", () => {
  assertProperty(fc.property(
    fc.integer(),
    fc.array(fc.string(), { maxLength: 50 }),
    (count, messages) => {
      const options = { scenarios: testScenarios(), parseWorld: parseTestWorld };
      const serialized = serializeFixtureJson({
        scenario: "chat.empty",
        world: { count, messages },
      }, options);
      if (!serialized.ok) throw new Error(serialized.error.message);
      expect(parseFixtureJson(serialized.value, options)).toEqual(parseFixtureEnvelope(
        JSON.parse(serialized.value),
        options,
      ));
    },
  ));
});
