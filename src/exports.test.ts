import { describe, expect, test } from "bun:test";

import * as root from "@cclrte/carapace";
import * as core from "@cclrte/carapace/core";
import { createCarapaceReactBindings } from "@cclrte/carapace/react";
import * as testing from "@cclrte/carapace/testing";
import * as web from "@cclrte/carapace/web";

describe("public package exports", () => {
  test("the default entry is the curated definition and activation surface", () => {
    expect(Object.keys(root).toSorted()).toEqual([
      "FIXTURE_QUERY_KEY",
      "SCENARIO_QUERY_KEY",
      "defineCarapace",
      "parseCarapaceDefinition",
      "tryDefineCarapace",
    ]);
    expect(root.FIXTURE_QUERY_KEY).toBe(core.FIXTURE_QUERY_KEY);
    expect(root.SCENARIO_QUERY_KEY).toBe(core.SCENARIO_QUERY_KEY);
    expect("defineCarapace" in core).toBeFalse();
    expect("parseCarapaceDefinition" in core).toBeFalse();
    expect("tryDefineCarapace" in core).toBeFalse();
    expect("createCarapaceStore" in root).toBeFalse();
    expect("parseCarapaceQuery" in root).toBeFalse();
    expect(typeof core.createCarapaceStore).toBe("function");
    expect("createCarapaceSession" in root).toBeFalse();
    expect("installCarapaceBrowserBridge" in root).toBeFalse();
  });

  test("testing and web mechanics remain opt-in", () => {
    expect(Object.keys(web).toSorted()).toEqual([
      "CARAPACE_BROWSER_BRIDGE_SCHEMA",
      "installCarapaceBrowser",
      "installCarapaceBrowserBridge",
      "installCarapaceFetchFirewall",
    ]);
    expect(typeof testing.createCarapaceSession).toBe("function");
    expect(typeof testing.createExactScriptedTransport).toBe("function");
    expect(typeof web.installCarapaceBrowserBridge).toBe("function");
    expect(typeof web.installCarapaceFetchFirewall).toBe("function");
    expect(typeof web.installCarapaceBrowser).toBe("function");
  });

  test("React bindings can be created without owning a product component tree", () => {
    const bindings = createCarapaceReactBindings();
    expect(typeof bindings.Provider).toBe("function");
    expect(typeof bindings.useSnapshot).toBe("function");
    expect(bindings.Context).toBeDefined();
  });
});
