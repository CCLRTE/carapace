import { describe, expect, test } from "bun:test";

import {
  CARAPACE_COVERAGE_SCHEMA,
  createCoverageCatalog,
  createCoverageCatalogSnapshot,
} from "../core/coverage.js";
import { createCarapaceStore } from "../core/store.js";
import { parseTestWorld } from "../core/test-support.js";
import { createCarapaceProbe } from "../testing/probe.js";
import {
  CARAPACE_BROWSER_BRIDGE_SCHEMA,
  installCarapaceBrowserBridge,
  type CarapaceBrowserBridge,
} from "./browser-bridge.js";

function probeFixture() {
  const store = createCarapaceStore({ count: 0, messages: [] }, parseTestWorld);
  if (!store.ok) throw new Error(store.error.message);
  const probe = createCarapaceProbe({
    store: store.value,
    activationHash: "bridge-hash",
    pending: [{ name: "requests", read: () => 0 }],
  });
  if (!probe.ok) throw new Error(probe.error.message);
  return probe.value;
}

function coverageFixture() {
  const catalog = createCoverageCatalog([{
    key: "surface.ready",
    mode: "fixture",
    claim: "The ready surface renders",
    route: "/",
    scenarios: ["surface.ready"],
  }]);
  if (!catalog.ok) throw new Error(catalog.error.message);
  return createCoverageCatalogSnapshot(catalog.value);
}

function hostileThrownValue(): Error {
  return new Proxy(new Error("hostile"), {
    get: () => {
      throw new Error("hostile message getter");
    },
    getPrototypeOf: () => {
      throw new Error("hostile prototype");
    },
  });
}

describe("Carapace browser bridge", () => {
  test("exposes canonical and legacy globals, then restores prior values idempotently", () => {
    const originalSnapshot = () => ({ original: true });
    const target: Record<string, unknown> = {
      __carapaceActivitySnapshot: originalSnapshot,
      __carapaceCoverage: ["original"],
    };
    let resets = 0;
    const installed = installCarapaceBrowserBridge({
      target,
      probe: probeFixture(),
      coverage: coverageFixture(),
      reset: () => { resets += 1; },
      legacyActivitySnapshot: (snapshot) => ({
        generation: snapshot.generation,
        inFlightOperations: snapshot.activity.active,
        activationHash: snapshot.activationHash,
      }),
    });
    if (!installed.ok) throw new Error(installed.error.message);

    const bridge = target.__carapace as CarapaceBrowserBridge;
    expect(bridge.schema).toBe(CARAPACE_BROWSER_BRIDGE_SCHEMA);
    expect(bridge.snapshot()).toMatchObject({
      schema: "carapace.probe/v1",
      activationHash: "bridge-hash",
      isQuiescent: true,
    });
    const legacy = target.__carapaceActivitySnapshot as () => unknown;
    expect(legacy()).toEqual({ generation: 1, inFlightOperations: 0, activationHash: "bridge-hash" });
    expect(bridge.coverage).toEqual(coverageFixture());
    expect(target.__carapaceCoverage).toEqual({
      schema: CARAPACE_COVERAGE_SCHEMA,
      entries: [expect.objectContaining({ key: "surface.ready", mode: "fixture" })],
    });
    (target.__carapaceReset as () => void)();
    expect(resets).toBe(1);

    installed.value();
    installed.value();
    expect(target.__carapaceActivitySnapshot).toBe(originalSnapshot);
    expect(target.__carapaceCoverage).toEqual(["original"]);
    expect("__carapace" in target).toBe(false);
    expect("__carapaceReset" in target).toBe(false);
  });

  test("a later install safely replaces the earlier install across targets", () => {
    const firstTarget: Record<string, unknown> = {};
    const secondTarget: Record<string, unknown> = {};
    const first = installCarapaceBrowserBridge({ target: firstTarget, probe: probeFixture() });
    if (!first.ok) throw new Error(first.error.message);
    const firstBridge = firstTarget.__carapace;
    const second = installCarapaceBrowserBridge({ target: secondTarget, probe: probeFixture() });
    if (!second.ok) throw new Error(second.error.message);

    expect("__carapace" in firstTarget).toBe(false);
    expect(secondTarget.__carapace).not.toBe(firstBridge);
    first.value();
    expect("__carapace" in secondTarget).toBe(true);
    second.value();
    expect("__carapace" in secondTarget).toBe(false);
  });

  test("uninstall does not overwrite a newer external owner", () => {
    const target: Record<string, unknown> = {};
    const installed = installCarapaceBrowserBridge({ target, probe: probeFixture() });
    if (!installed.ok) throw new Error(installed.error.message);
    const external = () => ({ external: true });
    target.__carapaceActivitySnapshot = external;
    installed.value();
    expect(target.__carapaceActivitySnapshot).toBe(external);
  });

  test("rejects malformed or semantically invalid coverage without mutating the target", () => {
    const target: Record<string, unknown> = {};
    expect(installCarapaceBrowserBridge({
      target,
      probe: probeFixture(),
      coverage: { invalid: undefined },
    })).toMatchObject({ ok: false, error: { code: "invalid-coverage" } });
    expect(installCarapaceBrowserBridge({
      target,
      probe: probeFixture(),
      coverage: {
        schema: CARAPACE_COVERAGE_SCHEMA,
        entries: [{ key: "surface.ready", mode: "fixture" }],
      },
    })).toMatchObject({ ok: false, error: { code: "invalid-coverage" } });
    expect(target).toEqual({});
  });

  test("a failed replacement leaves the active bridge installed", () => {
    const backing: Record<string, unknown> = {};
    let definitionsBeforeFailure = Number.POSITIVE_INFINITY;
    const target = new Proxy(backing, {
      defineProperty: (current, key, descriptor) => {
        if (definitionsBeforeFailure === 0) {
          definitionsBeforeFailure = Number.POSITIVE_INFINITY;
          throw new Error("replacement rejected");
        }
        definitionsBeforeFailure -= 1;
        return Reflect.defineProperty(current, key, descriptor);
      },
    });
    const first = installCarapaceBrowserBridge({ target, probe: probeFixture() });
    if (!first.ok) throw new Error(first.error.message);
    const firstBridge = target.__carapace;
    definitionsBeforeFailure = 1;

    expect(installCarapaceBrowserBridge({
      target,
      probe: probeFixture(),
    })).toMatchObject({ ok: false, error: { code: "install-failed" } });
    expect(target.__carapace).toBe(firstBridge);
    expect((target.__carapace as CarapaceBrowserBridge).snapshot()).toMatchObject({
      activationHash: "bridge-hash",
    });
    first.value();
    expect(backing).toEqual({});
  });

  test("wraps hostile legacy mapper and probe failures in controlled errors", () => {
    const hostile = hostileThrownValue();
    const target: Record<string, unknown> = {};
    const installed = installCarapaceBrowserBridge({
      target,
      probe: probeFixture(),
      legacyActivitySnapshot: () => {
        throw hostile;
      },
    });
    if (!installed.ok) throw new Error(installed.error.message);
    expect(() => (target.__carapaceActivitySnapshot as () => unknown)()).toThrow(
      "Carapace legacy snapshot failed: Unknown failure",
    );
    installed.value();

    const hostileProbeTarget: Record<string, unknown> = {};
    const hostileProbe = installCarapaceBrowserBridge({
      target: hostileProbeTarget,
      probe: {
        snapshot: () => {
          throw hostile;
        },
      },
    });
    if (!hostileProbe.ok) throw new Error(hostileProbe.error.message);
    expect(() => (hostileProbeTarget.__carapace as CarapaceBrowserBridge).snapshot()).toThrow(
      "Carapace probe failed: Unknown failure",
    );
    hostileProbe.value();
  });

  test("returns install failure when a hostile target rejects property definition", () => {
    const hostile = hostileThrownValue();
    const target = new Proxy({}, {
      defineProperty: () => {
        throw hostile;
      },
    });
    expect(installCarapaceBrowserBridge({ target, probe: probeFixture() })).toEqual({
      ok: false,
      error: { code: "install-failed", message: "Carapace browser bridge installation failed" },
    });
  });
});
