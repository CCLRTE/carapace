import { describe, expect, test } from "bun:test";
import { SCENARIO_QUERY_KEY } from "@cclrte/carapace";

import { createTodoCarapaceSession } from "./session";

describe("deterministic todo composition", () => {
  test("loads and completes todos through one session", async () => {
    const created = createTodoCarapaceSession(`?${SCENARIO_QUERY_KEY}=todos.populated`);
    if (!created.ok) throw new Error(created.error.message);

    expect(await created.value.product.port.readTodos()).toHaveLength(2);
    expect(await created.value.product.port.setCompleted("write-docs", true)).toContainEqual({
      id: "write-docs",
      title: "Write the public guide",
      completed: true,
    });
    expect(created.value.probe.snapshot()).toMatchObject({
      ok: true,
      value: {
        activity: { active: 0, started: 2, settled: 2 },
        pending: { todoOperations: 0 },
        violations: { activityFailures: 0, blockedNetworkRequests: 0 },
        isQuiescent: true,
      },
    });
    created.value.dispose();
    expect(created.value.isDisposed()).toBeTrue();
  });

  test("surfaces the declared write failure without a verifier violation", async () => {
    const created = createTodoCarapaceSession(`?${SCENARIO_QUERY_KEY}=todos.write-failure`);
    if (!created.ok) throw new Error(created.error.message);

    let rejection: unknown;
    try {
      await created.value.product.port.setCompleted("write-docs", true);
    } catch (reason) {
      rejection = reason;
    }
    expect(rejection).toBeInstanceOf(Error);
    if (!(rejection instanceof Error)) throw new Error("Expected the deterministic write to reject.");
    expect(rejection.message).toContain("deterministic store rejected");
    expect(await created.value.product.port.readTodos()).toContainEqual({
      id: "write-docs",
      title: "Write the public guide",
      completed: false,
    });
    expect(created.value.probe.snapshot()).toMatchObject({
      ok: true,
      value: {
        activity: { active: 0, started: 2, settled: 2 },
        violations: { activityFailures: 0, blockedNetworkRequests: 0 },
        isQuiescent: true,
      },
    });
    created.value.dispose();
  });
});
