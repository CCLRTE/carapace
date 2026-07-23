import { describe, expect, test } from "bun:test";
import { SCENARIO_QUERY_KEY } from "@cclrte/carapace";

import { todoCarapaceDefinition } from "./definition";
import { createTodoCarapaceSession } from "./session";

describe("todo Carapace definition", () => {
  test("activates the default and every stable scenario", () => {
    expect(todoCarapaceDefinition.activate("")).toMatchObject({
      ok: true,
      value: { scenario: "todos.populated", route: "/" },
    });
    expect(todoCarapaceDefinition.activate(`?${SCENARIO_QUERY_KEY}=todos.empty`)).toMatchObject({
      ok: true,
      value: { scenario: "todos.empty", world: { todos: [] } },
    });
    expect(todoCarapaceDefinition.activate(`?${SCENARIO_QUERY_KEY}=missing`)).toMatchObject({
      ok: false,
      error: { code: "unknown-scenario" },
    });
  });

  test("keeps fixture and direct claims exact", () => {
    expect(todoCarapaceDefinition.coverage.requireExactKeys([
      "todos.empty.render",
      "todos.completion",
      "todos.write.failure",
      "storage.local.direct",
    ])).toEqual({ ok: true, value: true });
    const created = createTodoCarapaceSession("");
    if (!created.ok) throw new Error(created.error.message);
    const snapshot = created.value.coverage;
    expect(snapshot.schema).toBe("carapace.coverage/v2");
    const direct = snapshot.entries.at(-1);
    expect(direct).toBeDefined();
    if (direct === undefined) throw new Error("Direct storage coverage is missing");
    expect({
      ...direct,
      key: String(direct.key),
      scenarios: [...direct.scenarios],
    }).toEqual({
      key: "storage.local.direct",
      mode: "direct",
      claim: "Browser local-storage parsing, quota behavior, and persistence require direct production-adapter evidence.",
      scenarios: [],
    });
    created.value.dispose();
  });
});
