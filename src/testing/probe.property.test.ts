import { expect, test } from "bun:test";
import { assertProperty, fc } from "../core/test-support.js";

import { createCarapaceStore } from "../core/store.js";
import { parseTestWorld } from "../core/test-support.js";
import { createCarapaceProbe } from "./probe.js";

test("property: quiescence is exactly zero store activity and zero pending counters", () => {
  assertProperty(fc.property(
    fc.array(fc.integer({ min: 0, max: 10_000 }), { maxLength: 20 }),
    fc.array(fc.integer({ min: 0, max: 10_000 }), { maxLength: 20 }),
    (pending, violations) => {
      const store = createCarapaceStore({ count: 0, messages: [] }, parseTestWorld);
      if (!store.ok) throw new Error(store.error.message);
      const probe = createCarapaceProbe({
        store: store.value,
        activationHash: "property-hash",
        pending: pending.map((value, index) => ({ name: `pending${String(index)}`, read: () => value })),
        violations: violations.map((value, index) => ({ name: `violation${String(index)}`, read: () => value })),
        readRemainingWork: () => ({ remaining: pending.length }),
      });
      if (!probe.ok) throw new Error(probe.error.message);
      const snapshot = probe.value.snapshot();
      if (!snapshot.ok) throw new Error(snapshot.error.message);
      expect(snapshot.value.isQuiescent).toBe(pending.every((value) => value === 0));
      expect(JSON.parse(JSON.stringify(snapshot.value))).toEqual(snapshot.value);
    },
  ));
});
