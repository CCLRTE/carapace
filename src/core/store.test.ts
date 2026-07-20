import { expect, test } from "bun:test";
import { createCarapaceStore } from "./store.js";
import { operationId } from "./ids.js";
import { parseTestWorld } from "./test-support.js";

function makeStore() {
  const created = createCarapaceStore({ count: 0, messages: [] }, parseTestWorld);
  if (!created.ok) {
    throw new Error(created.error.message);
  }
  return created.value;
}

test("transactions commit a validated clone once and failures stay atomic", () => {
  const store = makeStore();
  const initial = store.getSnapshot();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  const committed = store.transact(initial.generation, operationId("increment-000001"), (draft) => {
    draft.count += 1;
    draft.messages.push("committed");
  });
  expect(committed).toMatchObject({ ok: true, value: { world: { count: 1, messages: ["committed"] } } });
  expect(notifications).toBe(1);

  const beforeFailure = store.getSnapshot();
  const failed = store.transact(initial.generation, operationId("increment-000002"), (draft) => {
    draft.count = Number.NaN;
  });
  expect(failed).toMatchObject({ ok: false, error: { code: "invalid-world" } });
  expect(store.getSnapshot()).toBe(beforeFailure);
  expect(notifications).toBe(1);
  unsubscribe();
});

test("reset fences old activity leases and quiescence waiters", async () => {
  const store = makeStore();
  const oldGeneration = store.getSnapshot().generation;
  const lease = store.beginActivity(oldGeneration, operationId("stream-000001"));
  if (!lease.ok) {
    throw new Error(lease.error.message);
  }
  const waiting = store.whenQuiescent(oldGeneration);
  const reset = store.reset({ count: 9, messages: ["reset"] });
  expect(reset).toMatchObject({ ok: true, value: { activity: { active: 0, started: 0, settled: 0 } } });
  expect(lease.value.settle()).toMatchObject({ ok: false, error: { code: "stale-generation" } });
  expect(await waiting).toMatchObject({ ok: false, error: { code: "stale-generation" } });
});

test("quiescence resolves after the final current-generation activity settles", async () => {
  const store = makeStore();
  const current = store.getSnapshot().generation;
  const first = store.beginActivity(current, operationId("task-000001"));
  const second = store.beginActivity(current, operationId("task-000002"));
  if (!first.ok || !second.ok) {
    throw new Error("activities must start");
  }
  const waiting = store.whenQuiescent(current);
  expect(first.value.settle().ok).toBe(true);
  expect(store.isQuiescent(current)).toEqual({ ok: true, value: false });
  expect(second.value.settle().ok).toBe(true);
  expect(await waiting).toMatchObject({ ok: true, value: { activity: { active: 0, started: 2, settled: 2 } } });
});

test("throwing subscribers cannot corrupt mutation results or starve later listeners", () => {
  const listenerErrors: unknown[] = [];
  const created = createCarapaceStore(
    { count: 0, messages: [] },
    parseTestWorld,
    { onListenerError: (reason) => listenerErrors.push(reason) },
  );
  if (!created.ok) throw new Error(created.error.message);
  const store = created.value;
  let healthyNotifications = 0;
  store.subscribe(() => { throw new Error("broken listener"); });
  store.subscribe(() => { healthyNotifications += 1; });

  const result = store.transact(
    store.getSnapshot().generation,
    operationId("subscriber-000001"),
    (draft) => { draft.count = 7; },
  );

  expect(result).toMatchObject({ ok: true, value: { revision: 1, world: { count: 7 } } });
  expect(store.getSnapshot().world.count).toBe(7);
  expect(healthyNotifications).toBe(1);
  expect(listenerErrors).toHaveLength(1);
  expect(listenerErrors[0]).toEqual(new Error("broken listener"));
});
