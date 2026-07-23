import { expect, test } from "bun:test";

import { createScenarioCatalog } from "./scenario.js";
import { parseTestWorld } from "./test-support.js";

test("scenario routes reject raw control characters", () => {
  const created = createScenarioCatalog([{
    id: "case.ready",
    title: "Ready",
    route: "/safe\nX-Injected: yes",
    world: { count: 0, messages: [] },
  }], parseTestWorld);

  expect(created).toMatchObject({ ok: false, error: { code: "invalid-route" } });
});
