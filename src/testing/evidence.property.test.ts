import { describe, expect, test } from "bun:test";

import type { CoverageEntry } from "../core/coverage.js";
import { coverageKey, scenarioId } from "../core/ids.js";
import { assertProperty, fc } from "../core/test-support.js";
import { classifyCoverageEvidence } from "./evidence.js";

const ids = Object.freeze([
  scenarioId("surface.one"),
  scenarioId("surface.two"),
  scenarioId("surface.three"),
  scenarioId("surface.four"),
] as const);

const fixture = Object.freeze({
  key: coverageKey("surface.fixture"),
  mode: "fixture",
  claim: "Every generated state renders",
  scenarios: ids,
}) satisfies CoverageEntry;

const mixed = Object.freeze({
  ...fixture,
  key: coverageKey("surface.mixed"),
  mode: "mixed",
}) satisfies CoverageEntry;

describe("coverage evidence classification properties", () => {
  test("fixture completion is exactly the declared scenario subset law", () => {
    assertProperty(fc.property(
      fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
      (mask) => {
        const exercised = new Set(ids.filter((_, index) => mask[index]));
        const status = classifyCoverageEvidence(fixture, { exercisedScenarios: exercised });
        const count = exercised.size;
        expect(status).toBe(count === 0 ? "not-exercised" : count === ids.length ? "verified" : "partial");
      },
    ));
  });

  test("direct evidence closes mixed claims if and only if their fixture half is complete", () => {
    assertProperty(fc.property(
      fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
      (mask) => {
        const exercised = new Set(ids.filter((_, index) => mask[index]));
        const withoutDirect = classifyCoverageEvidence(mixed, { exercisedScenarios: exercised });
        const withDirect = classifyCoverageEvidence(mixed, {
          exercisedScenarios: exercised,
          directEvidence: "verified",
        });
        if (exercised.size === ids.length) {
          expect(withoutDirect).toBe("fixture-verified");
          expect(withDirect).toBe("verified");
        } else {
          expect(withDirect).not.toBe("verified");
        }
      },
    ));
  });
});
