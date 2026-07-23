import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createCarapaceStore } from "./core/store.js";
import { parseTestWorld, type TestWorld } from "./core/test-support.js";
import { createCarapaceReactBindings } from "./react.js";

function storeFixture(count: number) {
  const created = createCarapaceStore({ count, messages: [] }, parseTestWorld);
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

describe("Carapace React bindings", () => {
  test("Provider supplies the matching store to all hooks during server rendering", () => {
    const bindings = createCarapaceReactBindings<TestWorld>();
    const store = storeFixture(7);

    function SnapshotView() {
      const selectedStore = bindings.useStore();
      const snapshot = bindings.useSnapshot();
      const world = bindings.useWorld();
      return createElement(
        "output",
        {
          "data-generation": String(snapshot.generation),
          "data-selected-store": String(selectedStore === store),
        },
        String(world.count),
      );
    }

    const markup = renderToStaticMarkup(createElement(bindings.Provider, {
      store,
      children: createElement(SnapshotView),
    }));
    expect(markup).toBe(
      '<output data-generation="1" data-selected-store="true">7</output>',
    );
  });

  test("hooks fail with a controlled error outside their matching Provider", () => {
    const first = createCarapaceReactBindings<TestWorld>();
    const second = createCarapaceReactBindings<TestWorld>();

    function FirstWorld() {
      return createElement("output", null, String(first.useWorld().count));
    }

    expect(() => renderToStaticMarkup(createElement(FirstWorld))).toThrow(
      "Carapace hooks require their matching Carapace Provider",
    );
    expect(() => renderToStaticMarkup(createElement(second.Provider, {
      store: storeFixture(2),
      children: createElement(FirstWorld),
    }))).toThrow("Carapace hooks require their matching Carapace Provider");
  });
});
