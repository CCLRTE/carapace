import { expect, test } from "bun:test";
import { assertProperty, fc } from "./test-support.js";
import {
  createCoverageCatalog,
  createCoverageCatalogSnapshot,
  parseCoverageCatalogSnapshot,
} from "./coverage.js";
import { testScenarios } from "./test-support.js";

test("property: duplicate coverage keys are rejected before their claims can diverge", () => {
  const claim = fc.array(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"),
    { minLength: 1, maxLength: 40 },
  ).map((characters) => characters.join(""));
  assertProperty(fc.property(
    fc.constantFrom<"fixture" | "mixed">("fixture", "mixed"),
    claim,
    claim,
    (mode, firstClaim, secondClaim) => {
      const catalog = createCoverageCatalog([
        { key: "chat.render", mode, claim: firstClaim, scenarios: ["chat.empty"] },
        { key: "chat.render", mode, claim: secondClaim, scenarios: ["chat.empty"] },
      ], testScenarios());
      expect(catalog).toMatchObject({ ok: false, error: { code: "duplicate-coverage" } });
    },
  ));
});

test("property: coverage snapshots round trip arbitrary valid non-direct entries", () => {
  const identifier = fc.array(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"),
    { minLength: 1, maxLength: 20 },
  ).map((characters) => `case.${characters.join("")}`);
  const claim = fc.tuple(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"),
    fc.array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz "), { maxLength: 79 }),
  ).map(([first, remaining]) => `${first}${remaining.join("")}`);
  assertProperty(fc.property(
    fc.constantFrom<"fixture" | "mixed">("fixture", "mixed"),
    claim,
    fc.uniqueArray(identifier, { minLength: 1, maxLength: 6 }),
    (mode, generatedClaim, generatedScenarios) => {
      const [firstScenario, ...remainingScenarios] = generatedScenarios;
      if (firstScenario === undefined) throw new Error("scenario arbitrary must be nonempty");
      const catalog = createCoverageCatalog([{
        key: "coverage.roundtrip",
        mode,
        claim: generatedClaim,
        scenarios: [firstScenario, ...remainingScenarios],
      }]);
      if (!catalog.ok) throw new Error(catalog.error.message);
      const snapshot = createCoverageCatalogSnapshot(catalog.value);

      expect(parseCoverageCatalogSnapshot(JSON.parse(JSON.stringify(snapshot)) as unknown)).toEqual({
        ok: true,
        value: snapshot,
      });
    },
  ));
});

test("property: coverage snapshot parsing is total over arbitrary foreign values", () => {
  assertProperty(fc.property(
    fc.anything({ withBigInt: true, withMap: true, withSet: true }),
    (input) => {
      expect(() => parseCoverageCatalogSnapshot(input)).not.toThrow();
    },
  ));
});
