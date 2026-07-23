import { describe, expect, test } from "bun:test";

import type { CoverageEntry } from "../core/coverage.js";
import { coverageKey, scenarioId } from "../core/ids.js";
import { classifyCoverageEvidence } from "./evidence.js";

const fixture = Object.freeze({
  key: coverageKey("surface.fixture"),
  mode: "fixture",
  claim: "Fixture state renders",
  scenarios: Object.freeze([scenarioId("surface.empty"), scenarioId("surface.ready")] as const),
}) satisfies CoverageEntry;

const mixed = Object.freeze({
  ...fixture,
  key: coverageKey("surface.mixed"),
  mode: "mixed",
}) satisfies CoverageEntry;

const direct = Object.freeze({
  key: coverageKey("surface.direct"),
  mode: "direct",
  claim: "The live provider behaves correctly",
  scenarios: Object.freeze([] as const),
}) satisfies CoverageEntry;

describe("coverage evidence classification", () => {
  test("distinguishes absent, partial, and complete fixture evidence", () => {
    expect(classifyCoverageEvidence(fixture, { exercisedScenarios: new Set() })).toBe("not-exercised");
    expect(classifyCoverageEvidence(fixture, {
      exercisedScenarios: new Set(["surface.empty"]),
    })).toBe("partial");
    expect(classifyCoverageEvidence(fixture, {
      exercisedScenarios: new Set(["surface.empty", "surface.ready"]),
    })).toBe("verified");
  });

  test("keeps a complete mixed fixture half explicit until direct evidence passes", () => {
    const complete = new Set(["surface.empty", "surface.ready"]);
    expect(classifyCoverageEvidence(mixed, { exercisedScenarios: complete })).toBe("fixture-verified");
    expect(classifyCoverageEvidence(mixed, {
      exercisedScenarios: complete,
      directEvidence: "verified",
    })).toBe("verified");
    expect(classifyCoverageEvidence(mixed, {
      exercisedScenarios: new Set(),
      directEvidence: "verified",
    })).toBe("partial");
  });

  test("requires direct evidence only for direct claims", () => {
    expect(classifyCoverageEvidence(direct, { exercisedScenarios: new Set() })).toBe("direct-required");
    expect(classifyCoverageEvidence(direct, {
      exercisedScenarios: new Set(),
      directEvidence: "verified",
    })).toBe("verified");
  });
});
