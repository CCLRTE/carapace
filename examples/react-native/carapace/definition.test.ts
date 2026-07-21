import { describe, expect, test } from "bun:test";
import { createCoverageCatalogSnapshot, SCENARIO_QUERY_KEY } from "@cclrte/carapace";

import { deviceStatusCarapaceDefinition } from "./definition";

describe("React Native Carapace definition", () => {
  test("activates the default and every stable scenario", () => {
    expect(deviceStatusCarapaceDefinition.activate("")).toMatchObject({
      ok: true,
      value: { scenario: "ios-ready", route: "/" },
    });
    expect(deviceStatusCarapaceDefinition.activate(
      `?${SCENARIO_QUERY_KEY}=android-dark`,
    )).toMatchObject({
      ok: true,
      value: { scenario: "android-dark", world: { device: { platform: "android" } } },
    });
    expect(deviceStatusCarapaceDefinition.activate(
      `?${SCENARIO_QUERY_KEY}=missing`,
    )).toMatchObject({ ok: false, error: { code: "unknown-scenario" } });
  });

  test("keeps fixture and direct coverage exact", () => {
    expect(deviceStatusCarapaceDefinition.coverage.requireExactKeys([
      "device.status.ready",
      "device.status.failure",
      "native.platform.direct",
    ])).toEqual({ ok: true, value: true });

    const snapshot = createCoverageCatalogSnapshot(deviceStatusCarapaceDefinition.coverage);
    expect(snapshot.entries.at(-1)).toMatchObject({
      key: "native.platform.direct",
      mode: "direct",
      route: null,
      scenarios: [],
    });
  });
});
