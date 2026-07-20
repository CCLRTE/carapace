import { describe, expect, test } from "bun:test";

import {
  CARAPACE_COVERAGE_SCHEMA,
  createCoverageCatalog,
  createCoverageCatalogSnapshot,
  parseCoverageCatalogSnapshot,
} from "./coverage.js";

describe("coverage wire snapshots", () => {
  test("creates and parses an exact versioned frozen snapshot", () => {
    const catalog = createCoverageCatalog([
      {
        key: "chat.ready",
        mode: "fixture",
        claim: "Ready chat renders",
        route: "/chat",
        scenarios: ["chat.ready"],
      },
      {
        key: "native.lifecycle",
        mode: "direct",
        claim: "The native host survives a lifecycle transition",
        route: null,
        scenarios: [],
      },
    ]);
    if (!catalog.ok) throw new Error(catalog.error.message);
    const snapshot = createCoverageCatalogSnapshot(catalog.value);
    const parsed = parseCoverageCatalogSnapshot(JSON.parse(JSON.stringify(snapshot)));
    if (!parsed.ok) throw new Error(parsed.error.message);
    expect(parsed.value.schema).toBe(CARAPACE_COVERAGE_SCHEMA);
    expect(parsed.value.entries.map(({ key }) => String(key))).toEqual(["chat.ready", "native.lifecycle"]);
    expect(Object.isFrozen(parsed.value)).toBeTrue();
    expect(Object.isFrozen(parsed.value.entries)).toBeTrue();
  });

  test("rejects foreign keys, incomplete entries, invalid schemas, and invalid proof modes", () => {
    expect(parseCoverageCatalogSnapshot({ schema: CARAPACE_COVERAGE_SCHEMA, entries: [{
      key: "chat.ready",
      mode: "fixture",
      claim: "Ready chat renders",
      route: "/chat",
      scenarios: ["chat.ready"],
      status: "verified",
    }] })).toMatchObject({ ok: false, error: { code: "invalid-coverage" } });
    expect(parseCoverageCatalogSnapshot({
      schema: CARAPACE_COVERAGE_SCHEMA,
      entries: [{ key: "chat.ready" }],
    })).toMatchObject({
      ok: false,
      error: { code: "invalid-coverage" },
    });
    expect(parseCoverageCatalogSnapshot({ schema: CARAPACE_COVERAGE_SCHEMA, entries: [{
      key: "chat.ready",
      mode: "probable",
      claim: "Ready chat renders",
      route: "/chat",
      scenarios: ["chat.ready"],
    }] })).toMatchObject({ ok: false, error: { code: "invalid-coverage" } });
    expect(parseCoverageCatalogSnapshot({ schema: "carapace.coverage/v2", entries: [] })).toMatchObject({
      ok: false,
      error: { code: "invalid-coverage" },
    });
    expect(parseCoverageCatalogSnapshot({
      schema: CARAPACE_COVERAGE_SCHEMA,
      entries: [],
      status: "verified",
    })).toMatchObject({ ok: false, error: { code: "invalid-coverage" } });
  });
});
