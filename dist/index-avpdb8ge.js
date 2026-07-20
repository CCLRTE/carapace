import {
  cloneJson,
  err,
  isRecord,
  ok,
  parseAndCloneWorld,
  parseJsonValue,
  parseOperationId,
  renderUnknownReason
} from "./index-nv4eqpe5.js";

// src/core/runtime.ts
var LOGICAL_RUNTIME_SCHEMA = "carapace.runtime/v1";
var DEFAULT_LOGICAL_RUNTIME_SNAPSHOT = Object.freeze({
  schema: LOGICAL_RUNTIME_SCHEMA,
  nowMs: 0,
  nextOperation: 1,
  acceleration: 100
});
var RUNTIME_KEYS = new Set(["schema", "nowMs", "nextOperation", "acceleration"]);
var NAMESPACE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
function parseLogicalRuntimeSnapshot(input) {
  const parsedJson = parseJsonValue(input);
  if (!parsedJson.ok || !isRecord(parsedJson.value)) {
    return err({ code: "invalid-runtime", message: "Logical runtime must be an object" });
  }
  for (const key of Object.keys(parsedJson.value)) {
    if (!RUNTIME_KEYS.has(key)) {
      return err({ code: "invalid-runtime", message: `Unknown logical runtime key: ${key}` });
    }
  }
  const record = parsedJson.value;
  if (record.schema !== LOGICAL_RUNTIME_SCHEMA) {
    return err({ code: "invalid-runtime", message: `Logical runtime schema must be ${LOGICAL_RUNTIME_SCHEMA}` });
  }
  if (typeof record.nowMs !== "number" || !Number.isSafeInteger(record.nowMs) || record.nowMs < 0) {
    return err({ code: "invalid-runtime", message: "Logical nowMs must be a non-negative safe integer" });
  }
  if (typeof record.nextOperation !== "number" || !Number.isSafeInteger(record.nextOperation) || record.nextOperation < 1) {
    return err({ code: "invalid-runtime", message: "Logical nextOperation must be a positive safe integer" });
  }
  if (typeof record.acceleration !== "number" || !Number.isFinite(record.acceleration) || record.acceleration < 1 || record.acceleration > 1e6) {
    return err({ code: "invalid-runtime", message: "Logical acceleration must be in [1, 1000000]" });
  }
  return ok(Object.freeze({
    schema: LOGICAL_RUNTIME_SCHEMA,
    nowMs: record.nowMs,
    nextOperation: record.nextOperation,
    acceleration: record.acceleration
  }));
}
function defaultSleep(wallMilliseconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    let timeout = null;
    let settled = false;
    const finish = () => {
      if (settled)
        return;
      settled = true;
      if (timeout !== null)
        clearTimeout(timeout);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    signal?.addEventListener("abort", finish, { once: true });
    timeout = setTimeout(finish, wallMilliseconds);
  });
}
function parseDuration(logicalMilliseconds) {
  return Number.isSafeInteger(logicalMilliseconds) && logicalMilliseconds >= 0 ? ok(logicalMilliseconds) : err({ code: "invalid-duration", message: "Logical durations must be non-negative safe integers" });
}
function isWaitCancelled(signal) {
  return signal?.aborted === true;
}
function waitCancelled() {
  return err({
    code: "wait-cancelled",
    message: "Logical wait was cancelled"
  });
}
function createLogicalRuntime(initial = DEFAULT_LOGICAL_RUNTIME_SNAPSHOT, sleep = defaultSleep) {
  const parsed = parseLogicalRuntimeSnapshot(initial);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  let nowMs = parsed.value.nowMs;
  let nextOperation = parsed.value.nextOperation;
  const acceleration = parsed.value.acceleration;
  let waitTail = Promise.resolve();
  const snapshot = () => Object.freeze({
    schema: LOGICAL_RUNTIME_SCHEMA,
    nowMs,
    nextOperation,
    acceleration
  });
  const advance = (logicalMilliseconds) => {
    const duration = parseDuration(logicalMilliseconds);
    if (!duration.ok) {
      return duration;
    }
    const nextNow = nowMs + duration.value;
    if (!Number.isSafeInteger(nextNow)) {
      return err({ code: "time-overflow", message: "Logical time exceeds the safe integer range" });
    }
    nowMs = nextNow;
    return ok(nowMs);
  };
  const wait = (logicalMilliseconds, signal) => {
    const duration = parseDuration(logicalMilliseconds);
    if (!duration.ok) {
      return Promise.resolve(duration);
    }
    const run = waitTail.then(async () => {
      if (isWaitCancelled(signal))
        return waitCancelled();
      const wallMilliseconds = Math.ceil(duration.value / acceleration);
      try {
        if (wallMilliseconds > 0) {
          await sleep(wallMilliseconds, signal);
        }
      } catch (reason) {
        if (isWaitCancelled(signal))
          return waitCancelled();
        return err({
          code: "sleep-failed",
          message: renderUnknownReason(reason, "Logical sleep failed")
        });
      }
      if (isWaitCancelled(signal))
        return waitCancelled();
      return advance(duration.value);
    });
    waitTail = run.then(() => {
      return;
    }, () => {
      return;
    });
    return run;
  };
  return Object.freeze({
    now: () => nowMs,
    snapshot,
    nextOperationId: (namespace = "operation") => {
      if (!NAMESPACE_PATTERN.test(namespace) || namespace.length > 48) {
        throw new Error("Operation namespaces must be lowercase hyphen-separated ASCII identifiers");
      }
      if (!Number.isSafeInteger(nextOperation) || nextOperation >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Operation sequence exceeds the safe integer range");
      }
      const candidate = `${namespace}-${String(nextOperation).padStart(6, "0")}`;
      nextOperation += 1;
      const parsedOperation = parseOperationId(candidate);
      if (!parsedOperation.ok) {
        throw new Error(parsedOperation.error.message);
      }
      return parsedOperation.value;
    },
    advance,
    wait
  });
}

// src/core/store.ts
function storeError(code, message, operation = null) {
  return { code, message, operation };
}
function generation(value) {
  return value;
}
function activity(active, started, settled) {
  return Object.freeze({ active, started, settled });
}
function storeSnapshot(currentGeneration, revision, world, currentActivity) {
  return Object.freeze({ generation: currentGeneration, revision, world, activity: currentActivity });
}
function createCarapaceStore(initialWorld, parseWorld, options = {}) {
  const initial = parseAndCloneWorld(initialWorld, parseWorld);
  if (!initial.ok) {
    return err(storeError("invalid-world", initial.error.message));
  }
  let currentGeneration = generation(1);
  let revision = 0;
  let currentActivity = activity(0, 0, 0);
  let snapshot = storeSnapshot(currentGeneration, revision, initial.value, currentActivity);
  const listeners = new Set;
  const activeOperations = new Set;
  const publish = (world = snapshot.world) => {
    revision += 1;
    snapshot = storeSnapshot(currentGeneration, revision, world, currentActivity);
    for (const listener of listeners) {
      try {
        listener();
      } catch (reason) {
        try {
          options.onListenerError?.(reason);
        } catch {}
      }
    }
    return snapshot;
  };
  const stale = (expected, operation = null) => expected === currentGeneration ? null : storeError("stale-generation", `Generation ${String(expected)} is stale; current generation is ${String(currentGeneration)}`, operation);
  const validateOperation = (candidate) => {
    const parsed = parseOperationId(candidate);
    return parsed.ok ? ok(parsed.value) : err(storeError("invalid-operation", parsed.error.message));
  };
  const settleActivity = (expected, candidate) => {
    const operation = validateOperation(candidate);
    if (!operation.ok) {
      return operation;
    }
    const staleError = stale(expected, operation.value);
    if (staleError !== null) {
      return err(staleError);
    }
    if (!activeOperations.delete(operation.value)) {
      return err(storeError("activity-not-found", `Activity is not active: ${operation.value}`, operation.value));
    }
    currentActivity = activity(currentActivity.active - 1, currentActivity.started, currentActivity.settled + 1);
    return ok(publish());
  };
  const store = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    transact: (expected, candidate, update) => {
      const operation = validateOperation(candidate);
      if (!operation.ok) {
        return operation;
      }
      const staleError = stale(expected, operation.value);
      if (staleError !== null) {
        return err(staleError);
      }
      const cloned = cloneJson(snapshot.world);
      if (!cloned.ok) {
        return err(storeError("invalid-world", cloned.error.message, operation.value));
      }
      let candidateWorld;
      try {
        const draft = parseWorld(cloned.value);
        const returned = update(draft);
        candidateWorld = returned === undefined ? draft : returned;
      } catch (reason) {
        return err(storeError("transaction-failed", renderUnknownReason(reason), operation.value));
      }
      const validated = parseAndCloneWorld(candidateWorld, parseWorld);
      if (!validated.ok) {
        return err(storeError("invalid-world", validated.error.message, operation.value));
      }
      return ok(publish(validated.value));
    },
    reset: (world) => {
      const validated = parseAndCloneWorld(world, parseWorld);
      if (!validated.ok) {
        return err(storeError("invalid-world", validated.error.message));
      }
      const nextGeneration = Number(currentGeneration) + 1;
      if (!Number.isSafeInteger(nextGeneration)) {
        return err(storeError("generation-overflow", "Store generation exceeds the safe integer range"));
      }
      currentGeneration = generation(nextGeneration);
      activeOperations.clear();
      currentActivity = activity(0, 0, 0);
      return ok(publish(validated.value));
    },
    beginActivity: (expected, candidate) => {
      const operation = validateOperation(candidate);
      if (!operation.ok) {
        return operation;
      }
      const staleError = stale(expected, operation.value);
      if (staleError !== null) {
        return err(staleError);
      }
      if (activeOperations.has(operation.value)) {
        return err(storeError("duplicate-activity", `Activity is already active: ${operation.value}`, operation.value));
      }
      activeOperations.add(operation.value);
      currentActivity = activity(currentActivity.active + 1, currentActivity.started + 1, currentActivity.settled);
      publish();
      const lease = Object.freeze({
        generation: expected,
        operation: operation.value,
        settle: () => settleActivity(expected, operation.value)
      });
      return ok(lease);
    },
    settleActivity,
    isQuiescent: (expected) => {
      const staleError = stale(expected);
      return staleError === null ? ok(currentActivity.active === 0) : err(staleError);
    },
    whenQuiescent: (expected) => {
      const staleError = stale(expected);
      if (staleError !== null) {
        return Promise.resolve(err(staleError));
      }
      if (currentActivity.active === 0) {
        return Promise.resolve(ok(snapshot));
      }
      return new Promise((resolve) => {
        const unsubscribe = store.subscribe(() => {
          const nextStaleError = stale(expected);
          if (nextStaleError !== null) {
            unsubscribe();
            resolve(err(nextStaleError));
          } else if (currentActivity.active === 0) {
            unsubscribe();
            resolve(ok(snapshot));
          }
        });
      });
    }
  };
  return ok(Object.freeze(store));
}

export { LOGICAL_RUNTIME_SCHEMA, DEFAULT_LOGICAL_RUNTIME_SNAPSHOT, parseLogicalRuntimeSnapshot, createLogicalRuntime, createCarapaceStore };
