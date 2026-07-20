import { describe, expect, test } from "bun:test";

import * as root from "@cclrte/carapace";
import * as core from "@cclrte/carapace/core";
import { createCarapaceReactBindings } from "@cclrte/carapace/react";
import * as testing from "@cclrte/carapace/testing";
import * as web from "@cclrte/carapace/web";

describe("public package exports", () => {
  test("the default and core entry points expose the same framework-free definition", () => {
    expect(root.defineCarapace).toBe(core.defineCarapace);
    expect(root.createCarapaceStore).toBe(core.createCarapaceStore);
    expect("createCarapaceSession" in root).toBeFalse();
    expect("installCarapaceBrowserBridge" in root).toBeFalse();
  });

  test("testing and web mechanics remain opt-in", () => {
    expect(typeof testing.createCarapaceSession).toBe("function");
    expect(typeof testing.createExactScriptedTransport).toBe("function");
    expect(typeof web.installCarapaceBrowserBridge).toBe("function");
    expect(typeof web.installCarapaceFetchFirewall).toBe("function");
  });

  test("React bindings can be created without owning a product component tree", () => {
    const bindings = createCarapaceReactBindings();
    expect(typeof bindings.Provider).toBe("function");
    expect(typeof bindings.useSnapshot).toBe("function");
    expect(bindings.Context).toBeDefined();
  });
});
