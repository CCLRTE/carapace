import { expect, test } from "bun:test";
import { assertProperty, fc } from "./test-support.js";
import { createCoverageCatalog, type CoverageMode } from "./coverage.js";
import { testScenarios, type TestRoute, type TestWorld } from "./test-support.js";

test("property: duplicate coverage keys are rejected before their claims can diverge", () => {
  const claim = fc.array(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"),
    { minLength: 1, maxLength: 40 },
  ).map((characters) => characters.join(""));
  assertProperty(fc.property(
    fc.constantFrom<CoverageMode>("fixture", "mixed"),
    claim,
    claim,
    (mode, firstClaim, secondClaim) => {
      const catalog = createCoverageCatalog<TestWorld, TestRoute>([
        { key: "chat.render", mode, claim: firstClaim, route: "/chat", scenarios: ["chat.empty"] },
        { key: "chat.render", mode, claim: secondClaim, route: "/chat", scenarios: ["chat.empty"] },
      ], testScenarios());
      expect(catalog).toMatchObject({ ok: false, error: { code: "duplicate-coverage" } });
    },
  ));
});
