import {
  createCarapaceStore,
  createLogicalRuntime
} from "../index-avpdb8ge.js";
import {
  canonicalJson,
  cloneJson,
  err,
  freezeJson,
  isRecord,
  ok,
  parseAndCloneWorld,
  parseJsonValue,
  renderUnknownReason
} from "../index-nv4eqpe5.js";

// src/testing/activity.ts
function storeErrorMessage(cause) {
  return renderUnknownReason(cause, "Carapace store operation failed");
}
function operationError(reason) {
  return Object.freeze({
    code: "operation-id-failed",
    message: renderUnknownReason(reason),
    operation: null,
    storeError: null,
    reason
  });
}
function storeError(code, operation, cause) {
  return Object.freeze({
    code,
    message: storeErrorMessage(cause),
    operation,
    storeError: cause,
    reason: null
  });
}
function createCarapaceActivityScope(store, runtime) {
  const begin = (namespace = "activity") => {
    let operation;
    try {
      operation = runtime.nextOperationId(namespace);
    } catch (reason) {
      return err(operationError(reason));
    }
    const currentGeneration = store.getSnapshot().generation;
    const started = store.beginActivity(currentGeneration, operation);
    if (!started.ok) {
      return err(storeError("store-begin-failed", operation, started.error));
    }
    let released = false;
    let releaseResult = null;
    const lease = Object.freeze({
      generation: currentGeneration,
      operation,
      isReleased: () => released,
      release: () => {
        if (releaseResult !== null)
          return releaseResult;
        released = true;
        const settled = started.value.settle();
        releaseResult = settled.ok ? ok(true) : err(storeError("store-settle-failed", operation, settled.error));
        return releaseResult;
      }
    });
    return ok(lease);
  };
  const run = async (namespace, work) => {
    const started = begin(namespace);
    if (!started.ok) {
      return err(Object.freeze({
        code: "begin-failed",
        message: started.error.message,
        operation: null,
        workError: null,
        activityError: started.error
      }));
    }
    let workResult;
    try {
      workResult = ok(await work());
    } catch (reason) {
      workResult = err(reason);
    }
    const released = started.value.release();
    if (workResult.ok && released.ok)
      return ok(workResult.value);
    if (!workResult.ok && released.ok) {
      return err(Object.freeze({
        code: "work-failed",
        message: renderUnknownReason(workResult.error),
        operation: started.value.operation,
        workError: workResult.error,
        activityError: null
      }));
    }
    if (workResult.ok && !released.ok) {
      return err(Object.freeze({
        code: "settlement-failed",
        message: released.error.message,
        operation: started.value.operation,
        workError: null,
        activityError: released.error
      }));
    }
    if (!workResult.ok && !released.ok) {
      return err(Object.freeze({
        code: "work-and-settlement-failed",
        message: `${renderUnknownReason(workResult.error)}; settlement failed: ${released.error.message}`,
        operation: started.value.operation,
        workError: workResult.error,
        activityError: released.error
      }));
    }
    throw new Error("Unreachable activity result");
  };
  return Object.freeze({ begin, run });
}
// src/testing/probe.ts
var CARAPACE_PROBE_SCHEMA = "carapace.probe/v1";
var MAX_CARAPACE_PROBE_COUNTERS = 128;
var COUNTER_NAME_PATTERN = /^[a-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$/u;
var SNAPSHOT_KEYS = new Set([
  "schema",
  "activationHash",
  "generation",
  "revision",
  "activity",
  "pending",
  "violations",
  "remainingWork",
  "isQuiescent"
]);
var ACTIVITY_KEYS = new Set(["active", "started", "settled"]);
function probeError(code, message, counter = null) {
  return Object.freeze({ code, message, counter });
}
function validActivationHash(value) {
  if (value.length === 0 || value.length > 256)
    return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127)
      return false;
  }
  return true;
}
function readNonNegativeInteger(input) {
  return typeof input === "number" && Number.isSafeInteger(input) && input >= 0 ? input : null;
}
function parseSnapshotCounters(input, category) {
  if (!isRecord(input)) {
    return err(probeError("invalid-snapshot", `Probe ${category} counters must be an object`));
  }
  const output = Object.create(null);
  for (const [name, candidate] of Object.entries(input)) {
    if (name.length > 80 || !COUNTER_NAME_PATTERN.test(name)) {
      return err(probeError("invalid-counter-name", "Counter names must be 1-80 ASCII alphanumeric characters with optional dots or hyphens", name));
    }
    const value = readNonNegativeInteger(candidate);
    if (value === null) {
      return err(probeError("invalid-counter", `Counter ${name} must be a non-negative safe integer`, name));
    }
    output[name] = value;
  }
  return ok(Object.freeze(output));
}
function parseCarapaceProbeSnapshot(input) {
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !isRecord(parsed.value)) {
    return err(probeError("invalid-snapshot", parsed.ok ? "Carapace probe snapshot must be an object" : parsed.error.message));
  }
  const record = parsed.value;
  for (const key of Object.keys(record)) {
    if (!SNAPSHOT_KEYS.has(key)) {
      return err(probeError("invalid-snapshot", `Unknown Carapace probe snapshot key: ${key}`));
    }
  }
  if (record.schema !== CARAPACE_PROBE_SCHEMA) {
    return err(probeError("invalid-snapshot", `Carapace probe schema must be ${CARAPACE_PROBE_SCHEMA}`));
  }
  if (typeof record.activationHash !== "string" || !validActivationHash(record.activationHash)) {
    return err(probeError("invalid-activation-hash", "Carapace probe activation hash is invalid"));
  }
  const generation = readNonNegativeInteger(record.generation);
  const revision = readNonNegativeInteger(record.revision);
  if (generation === null || generation < 1 || revision === null) {
    return err(probeError("invalid-snapshot", "Carapace probe generation must be positive and revision must be non-negative"));
  }
  if (!isRecord(record.activity)) {
    return err(probeError("invalid-snapshot", "Carapace probe activity must be an object"));
  }
  for (const key of Object.keys(record.activity)) {
    if (!ACTIVITY_KEYS.has(key)) {
      return err(probeError("invalid-snapshot", `Unknown Carapace activity key: ${key}`));
    }
  }
  const active = readNonNegativeInteger(record.activity.active);
  const started = readNonNegativeInteger(record.activity.started);
  const settled = readNonNegativeInteger(record.activity.settled);
  if (active === null || started === null || settled === null || settled > started || active !== started - settled) {
    return err(probeError("invalid-snapshot", "Carapace activity counters must be non-negative and conserve started work"));
  }
  const pending = parseSnapshotCounters(record.pending, "pending");
  if (!pending.ok)
    return pending;
  const violations = parseSnapshotCounters(record.violations, "violation");
  if (!violations.ok)
    return violations;
  if (Object.keys(pending.value).length + Object.keys(violations.value).length > MAX_CARAPACE_PROBE_COUNTERS) {
    return err(probeError("too-many-counters", `A probe supports at most ${String(MAX_CARAPACE_PROBE_COUNTERS)} counters`));
  }
  if (record.remainingWork === undefined) {
    return err(probeError("invalid-snapshot", "Carapace probe snapshot requires remainingWork"));
  }
  if (typeof record.isQuiescent !== "boolean") {
    return err(probeError("invalid-snapshot", "Carapace probe isQuiescent must be boolean"));
  }
  const expectedQuiescence = active === 0 && Object.values(pending.value).every((value) => value === 0);
  if (record.isQuiescent !== expectedQuiescence) {
    return err(probeError("invalid-snapshot", "Carapace probe isQuiescent does not match its activity and pending counters"));
  }
  return ok(Object.freeze({
    schema: CARAPACE_PROBE_SCHEMA,
    activationHash: record.activationHash,
    generation,
    revision,
    activity: Object.freeze({ active, started, settled }),
    pending: pending.value,
    violations: violations.value,
    remainingWork: freezeJson(record.remainingWork),
    isQuiescent: record.isQuiescent
  }));
}
function prepareCounters(pending, violations) {
  if (pending.length + violations.length > MAX_CARAPACE_PROBE_COUNTERS) {
    return err(probeError("too-many-counters", `A probe supports at most ${String(MAX_CARAPACE_PROBE_COUNTERS)} counters`));
  }
  const prepared = [];
  const seen = new Set;
  for (const [category, sources] of [
    ["pending", pending],
    ["violation", violations]
  ]) {
    for (const source of sources) {
      if (source.name.length > 80 || !COUNTER_NAME_PATTERN.test(source.name)) {
        return err(probeError("invalid-counter-name", "Counter names must be 1-80 ASCII alphanumeric characters with optional dots or hyphens", source.name));
      }
      const key = `${category}:${source.name}`;
      if (seen.has(key)) {
        return err(probeError("duplicate-counter", `Duplicate ${category} counter: ${source.name}`, source.name));
      }
      seen.add(key);
      prepared.push(Object.freeze({ ...source, category }));
    }
  }
  prepared.sort((left, right) => {
    const leftKey = `${left.category}:${left.name}`;
    const rightKey = `${right.category}:${right.name}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return ok(Object.freeze(prepared));
}
function readCounters(sources) {
  const pending = Object.create(null);
  const violations = Object.create(null);
  for (const source of sources) {
    let value;
    try {
      value = source.read();
    } catch (reason) {
      return err(probeError("probe-read-failed", renderUnknownReason(reason, `Failed to read ${source.name}`), source.name));
    }
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      return err(probeError("invalid-counter", `Counter ${source.name} must be a non-negative safe integer`, source.name));
    }
    (source.category === "pending" ? pending : violations)[source.name] = value;
  }
  return ok({ pending: Object.freeze(pending), violations: Object.freeze(violations) });
}
function readRemaining(read) {
  let candidate;
  try {
    candidate = read();
  } catch (reason) {
    return err(probeError("probe-read-failed", renderUnknownReason(reason, "Failed to read remaining work")));
  }
  const cloned = cloneJson(candidate);
  return cloned.ok ? ok(freezeJson(cloned.value)) : err(probeError("invalid-remaining-work", cloned.error.message));
}
function createCarapaceProbe(options) {
  if (!validActivationHash(options.activationHash)) {
    return err(probeError("invalid-activation-hash", "Activation hashes must be 1-256 characters without control characters"));
  }
  const counters = prepareCounters(options.pending ?? [], options.violations ?? []);
  if (!counters.ok)
    return counters;
  const readRemainingWork = options.readRemainingWork ?? (() => Object.freeze({}));
  const snapshot = () => {
    const read = readCounters(counters.value);
    if (!read.ok)
      return read;
    const remaining = readRemaining(readRemainingWork);
    if (!remaining.ok)
      return remaining;
    const storeSnapshot = options.store.getSnapshot();
    const isQuiescent = storeSnapshot.activity.active === 0 && Object.values(read.value.pending).every((value2) => value2 === 0);
    const value = {
      schema: CARAPACE_PROBE_SCHEMA,
      activationHash: options.activationHash,
      generation: Number(storeSnapshot.generation),
      revision: storeSnapshot.revision,
      activity: storeSnapshot.activity,
      pending: read.value.pending,
      violations: read.value.violations,
      remainingWork: remaining.value,
      isQuiescent
    };
    return ok(Object.freeze(value));
  };
  const probe = {
    snapshot,
    isQuiescent: () => {
      const current = snapshot();
      return current.ok ? ok(current.value.isQuiescent) : current;
    }
  };
  return ok(Object.freeze(probe));
}
// src/testing/session.ts
function frozenMessages(messages) {
  return Object.freeze([...messages]);
}
function isPromiseLike(value) {
  return (typeof value === "object" && value !== null || typeof value === "function") && typeof Reflect.get(value, "then") === "function";
}
function sessionError(error, cleanupErrors = []) {
  const failures = frozenMessages(cleanupErrors);
  switch (error.code) {
    case "activation-failed":
    case "store-failed":
    case "product-failed":
    case "observation-failed":
    case "probe-failed":
      return Object.freeze({ ...error, cleanupErrors: failures });
  }
}
function runCleanup(controller, cleanups) {
  const failures = [];
  try {
    controller.abort();
  } catch (reason) {
    failures.push(`Abort failed: ${renderUnknownReason(reason)}`);
  }
  for (const cleanup of [...cleanups].reverse()) {
    try {
      const returned = cleanup();
      if (returned !== undefined) {
        if (isPromiseLike(returned)) {
          Promise.resolve(returned).catch(() => {
            return;
          });
        }
        failures.push("Carapace cleanup must complete synchronously and return undefined");
      }
    } catch (reason) {
      failures.push(renderUnknownReason(reason, "Carapace cleanup failed"));
    }
  }
  return frozenMessages(failures);
}
function activateSession(definition, activation) {
  switch (activation.kind) {
    case "query":
      return definition.activate(activation.source);
    case "scenario":
      return definition.activateScenario(activation.scenario);
  }
}
function createCarapaceSession(options) {
  const activation = activateSession(options.definition, options.activation);
  if (!activation.ok) {
    return err(sessionError({
      code: "activation-failed",
      message: activation.error.message,
      queryError: activation.error,
      storeError: null,
      probeError: null
    }));
  }
  const store = options.storeOptions === undefined ? createCarapaceStore(activation.value.world, options.definition.parseWorld) : createCarapaceStore(activation.value.world, options.definition.parseWorld, options.storeOptions);
  if (!store.ok) {
    return err(sessionError({
      code: "store-failed",
      message: store.error.message,
      queryError: null,
      storeError: store.error,
      probeError: null
    }));
  }
  const clock = options.sleep === undefined ? createLogicalRuntime(activation.value.runtime) : createLogicalRuntime(activation.value.runtime, options.sleep);
  const activity = createCarapaceActivityScope(store.value, clock);
  const controller = new AbortController;
  const cleanups = [];
  let registrationOpen = true;
  const context = Object.freeze({
    activation: activation.value,
    world: activation.value.world,
    store: store.value,
    clock,
    activity,
    signal: controller.signal,
    onDispose: (cleanup) => {
      if (!registrationOpen) {
        throw new Error("Carapace cleanup must be registered during synchronous session construction");
      }
      cleanups.push(cleanup);
    }
  });
  let product;
  try {
    product = options.create(context);
    if (isPromiseLike(product)) {
      Promise.resolve(product).catch(() => {
        return;
      });
      throw new Error("Carapace product construction must complete synchronously");
    }
  } catch (reason) {
    registrationOpen = false;
    const cleanupErrors = runCleanup(controller, cleanups);
    return err(sessionError({
      code: "product-failed",
      message: renderUnknownReason(reason, "Carapace product construction failed"),
      queryError: null,
      storeError: null,
      probeError: null
    }, cleanupErrors));
  }
  let observation;
  try {
    const observed = options.observe?.(product, context) ?? Object.freeze({});
    if (isPromiseLike(observed)) {
      Promise.resolve(observed).catch(() => {
        return;
      });
      throw new Error("Carapace observation construction must complete synchronously");
    }
    observation = observed;
  } catch (reason) {
    registrationOpen = false;
    const cleanupErrors = runCleanup(controller, cleanups);
    return err(sessionError({
      code: "observation-failed",
      message: renderUnknownReason(reason, "Carapace observation construction failed"),
      queryError: null,
      storeError: null,
      probeError: null
    }, cleanupErrors));
  }
  registrationOpen = false;
  const probe = createCarapaceProbe({
    store: store.value,
    activationHash: activation.value.activationHash,
    ...observation.pending === undefined ? {} : { pending: observation.pending },
    ...observation.violations === undefined ? {} : { violations: observation.violations },
    ...observation.readRemainingWork === undefined ? {} : { readRemainingWork: observation.readRemainingWork }
  });
  if (!probe.ok) {
    const cleanupErrors = runCleanup(controller, cleanups);
    return err(sessionError({
      code: "probe-failed",
      message: probe.error.message,
      queryError: null,
      storeError: null,
      probeError: probe.error
    }, cleanupErrors));
  }
  let disposed = false;
  let disposalErrors = Object.freeze([]);
  const dispose = () => {
    if (disposed)
      return;
    disposed = true;
    disposalErrors = runCleanup(controller, cleanups);
  };
  return ok(Object.freeze({
    activation: activation.value,
    world: activation.value.world,
    store: store.value,
    clock,
    activity,
    product,
    probe: probe.value,
    signal: controller.signal,
    dispose,
    isDisposed: () => disposed,
    disposalErrors: () => disposalErrors
  }));
}
// src/testing/scripted-transport.ts
var DEFAULT_SCRIPTED_TRANSPORT_LIMITS = Object.freeze({
  maxSteps: 1e4,
  maxEventsPerStep: 1000,
  maxRecordedInternalErrors: 32,
  maxLogicalDelayPerStepMs: 60000,
  maxTotalLogicalDelayMs: 3600000
});
var STEP_KEYS = new Set(["request", "outcome", "delayMs", "eventsBefore", "eventsAfter"]);
var OUTCOME_KEYS = new Set(["kind", "value", "error"]);
var LIMIT_KEYS = new Set([
  "maxSteps",
  "maxEventsPerStep",
  "maxRecordedInternalErrors",
  "maxLogicalDelayPerStepMs",
  "maxTotalLogicalDelayMs"
]);
function definitionError(code, message, step = null) {
  return Object.freeze({ code, message, step });
}
function validateLimits(limits) {
  for (const key of Object.keys(limits)) {
    if (!LIMIT_KEYS.has(key)) {
      return err(definitionError("invalid-limits", `Unknown scripted transport limit: ${key}`));
    }
  }
  for (const [name, value] of [
    ["maxSteps", limits.maxSteps],
    ["maxEventsPerStep", limits.maxEventsPerStep],
    ["maxRecordedInternalErrors", limits.maxRecordedInternalErrors]
  ]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 1e5) {
      return err(definitionError("invalid-limits", `${name} must be a positive safe integer no greater than 100000`));
    }
  }
  for (const [name, value] of [
    ["maxLogicalDelayPerStepMs", limits.maxLogicalDelayPerStepMs],
    ["maxTotalLogicalDelayMs", limits.maxTotalLogicalDelayMs]
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      return err(definitionError("invalid-limits", `${name} must be a non-negative safe integer`));
    }
  }
  return ok(Object.freeze({ ...limits }));
}
function parseOwned(input, parser, label, step) {
  const parsed = parseAndCloneWorld(input, parser);
  return parsed.ok ? parsed : err(definitionError("invalid-step", `${label}: ${parsed.error.message}`, step));
}
function parseEvents(input, parser, label, step) {
  if (!Array.isArray(input)) {
    return err(definitionError("invalid-step", `${label} must be an array`, step));
  }
  const events = [];
  for (const candidate of input) {
    const parsed = parseOwned(candidate, parser, label, step);
    if (!parsed.ok)
      return parsed;
    events.push(parsed.value);
  }
  return ok(Object.freeze(events));
}
function parseSteps(options, limits) {
  const json = parseJsonValue(options.steps);
  if (!json.ok || !Array.isArray(json.value)) {
    return err(definitionError("invalid-script", json.ok ? "Transport steps must be an array" : json.error.message));
  }
  if (json.value.length > limits.maxSteps) {
    return err(definitionError("script-too-large", `Transport script exceeds ${String(limits.maxSteps)} steps`));
  }
  const steps = [];
  let totalLogicalDelayMs = 0;
  for (const [index, candidate] of json.value.entries()) {
    if (!isRecord(candidate)) {
      return err(definitionError("invalid-step", "Transport steps must be objects", index));
    }
    for (const key of Object.keys(candidate)) {
      if (!STEP_KEYS.has(key)) {
        return err(definitionError("invalid-step", `Unknown transport step key: ${key}`, index));
      }
    }
    if (!("request" in candidate) || !("outcome" in candidate)) {
      return err(definitionError("invalid-step", "Transport steps require request and outcome", index));
    }
    const request = parseOwned(candidate.request, options.parseRequest, "Invalid scripted request", index);
    if (!request.ok)
      return request;
    const requestCanonical = canonicalJson(request.value);
    if (!requestCanonical.ok) {
      return err(definitionError("invalid-step", requestCanonical.error.message, index));
    }
    if (!isRecord(candidate.outcome)) {
      return err(definitionError("invalid-step", "Transport outcome must be an object", index));
    }
    for (const key of Object.keys(candidate.outcome)) {
      if (!OUTCOME_KEYS.has(key)) {
        return err(definitionError("invalid-step", `Unknown transport outcome key: ${key}`, index));
      }
    }
    let outcome;
    if (candidate.outcome.kind === "response") {
      if (!("value" in candidate.outcome) || "error" in candidate.outcome) {
        return err(definitionError("invalid-step", "A response outcome requires only value", index));
      }
      const response = parseOwned(candidate.outcome.value, options.parseResponse, "Invalid scripted response", index);
      if (!response.ok)
        return response;
      outcome = Object.freeze({ kind: "response", value: response.value });
    } else if (candidate.outcome.kind === "failure") {
      if (!("error" in candidate.outcome) || "value" in candidate.outcome) {
        return err(definitionError("invalid-step", "A failure outcome requires only error", index));
      }
      const failure = parseOwned(candidate.outcome.error, options.parseFailure, "Invalid scripted failure", index);
      if (!failure.ok)
        return failure;
      outcome = Object.freeze({ kind: "failure", error: failure.value });
    } else {
      return err(definitionError("invalid-step", "Transport outcome kind must be response or failure", index));
    }
    const delayMs = "delayMs" in candidate ? candidate.delayMs : 0;
    if (typeof delayMs !== "number" || !Number.isSafeInteger(delayMs) || delayMs < 0) {
      return err(definitionError("invalid-step", "Transport delayMs must be a non-negative safe integer", index));
    }
    if (delayMs > limits.maxLogicalDelayPerStepMs) {
      return err(definitionError("script-too-large", `Transport delayMs exceeds the per-step limit of ${String(limits.maxLogicalDelayPerStepMs)}`, index));
    }
    if (totalLogicalDelayMs > limits.maxTotalLogicalDelayMs - delayMs) {
      return err(definitionError("script-too-large", `Transport script exceeds the total logical delay limit of ${String(limits.maxTotalLogicalDelayMs)}`, index));
    }
    totalLogicalDelayMs += delayMs;
    const eventsBeforeInput = "eventsBefore" in candidate ? candidate.eventsBefore : [];
    const eventsAfterInput = "eventsAfter" in candidate ? candidate.eventsAfter : [];
    if (!Array.isArray(eventsBeforeInput) || !Array.isArray(eventsAfterInput)) {
      return err(definitionError("invalid-step", "eventsBefore and eventsAfter must be arrays", index));
    }
    if (eventsBeforeInput.length > limits.maxEventsPerStep || eventsAfterInput.length > limits.maxEventsPerStep - eventsBeforeInput.length) {
      return err(definitionError("script-too-large", `Transport step exceeds the combined event limit of ${String(limits.maxEventsPerStep)}`, index));
    }
    const eventsBefore = parseEvents(eventsBeforeInput, options.parseEvent, "eventsBefore", index);
    if (!eventsBefore.ok)
      return eventsBefore;
    const eventsAfter = parseEvents(eventsAfterInput, options.parseEvent, "eventsAfter", index);
    if (!eventsAfter.ok)
      return eventsAfter;
    steps.push(Object.freeze({
      request: request.value,
      requestCanonical: requestCanonical.value,
      outcome,
      delayMs,
      eventsBefore: eventsBefore.value,
      eventsAfter: eventsAfter.value
    }));
  }
  return ok(Object.freeze(steps));
}
function transportError(code, message, step, expectedRequest, actualRequest, remainingSteps, pendingDeliveries) {
  return Object.freeze({
    code,
    message,
    step,
    expectedRequest,
    actualRequest,
    remainingSteps,
    pendingDeliveries
  });
}
function runtimeFailureMessage(error) {
  return `Logical wait failed: ${renderUnknownReason(error, "Unknown logical runtime failure")}`;
}
function createExactScriptedTransport(options) {
  const limits = validateLimits(options.limits ?? DEFAULT_SCRIPTED_TRANSPORT_LIMITS);
  if (!limits.ok)
    return limits;
  const parsedSteps = parseSteps(options, limits.value);
  if (!parsedSteps.ok)
    return parsedSteps;
  const listeners = new Set;
  const activeCancellations = new Set;
  const disposalController = new AbortController;
  const internalErrors = [];
  let droppedInternalErrors = 0;
  let nextStep = 0;
  let pending = 0;
  let disposed = false;
  let idleWaiters = [];
  const remainingSteps = () => parsedSteps.value.length - nextStep;
  const recordInternalError = (reason) => {
    const message = renderUnknownReason(reason, "Uninspectable internal transport failure").slice(0, 500);
    if (internalErrors.length < limits.value.maxRecordedInternalErrors)
      internalErrors.push(message);
    else
      droppedInternalErrors += 1;
  };
  const notifyIdle = () => {
    if (pending !== 0)
      return;
    const waiting = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiting)
      resolve();
  };
  const emit = (events) => {
    if (disposed)
      return false;
    for (const event of events) {
      if (disposed)
        return false;
      for (const listener of [...listeners]) {
        if (disposed)
          return false;
        try {
          listener(event);
        } catch (reason) {
          recordInternalError(reason);
          try {
            options.onListenerError?.(reason);
          } catch (reporterReason) {
            recordInternalError(reporterReason);
          }
        }
      }
    }
    return !disposed;
  };
  const currentError = (code, message, step = null, expected = null, actual = null) => transportError(code, message, step, expected, actual, remainingSteps(), pending);
  const internalError = () => {
    if (internalErrors.length === 0 && droppedInternalErrors === 0)
      return null;
    const suffix = droppedInternalErrors === 0 ? "" : `; ${String(droppedInternalErrors)} more omitted`;
    return currentError("internal-failure", `${internalErrors.join("; ")}${suffix}`);
  };
  const settleLease = (lease) => {
    if (lease === null)
      return;
    try {
      const released = lease.release();
      if (!released.ok)
        recordInternalError(released.error);
    } catch (reason) {
      recordInternalError(reason);
    }
  };
  const beginLease = () => {
    if (options.activity === undefined)
      return ok(null);
    try {
      const started = options.activity.begin(options.activityNamespace ?? "transport");
      return started.ok ? ok(started.value) : err(renderUnknownReason(started.error, "Activity scope failed"));
    } catch (reason) {
      return err(renderUnknownReason(reason, "Activity scope threw"));
    }
  };
  const fail = (error) => {
    recordInternalError(`${error.code}: ${error.message}`);
    return err(Object.freeze({ kind: "transport", error }));
  };
  const disposedFailure = (step = null, expected = null, actual = null) => err(Object.freeze({
    kind: "transport",
    error: currentError("transport-disposed", "The scripted transport has been disposed", step, expected, actual)
  }));
  const dispose = () => {
    if (disposed)
      return;
    disposed = true;
    listeners.clear();
    for (const cancel of [...activeCancellations]) {
      try {
        cancel();
      } catch (reason) {
        recordInternalError(reason);
      }
    }
    activeCancellations.clear();
    try {
      disposalController.abort();
    } catch (reason) {
      recordInternalError(reason);
    }
    notifyIdle();
  };
  const request = (input) => {
    if (disposed)
      return Promise.resolve(disposedFailure());
    const parsedRequest = parseAndCloneWorld(input, options.parseRequest);
    if (!parsedRequest.ok) {
      if (disposed)
        return Promise.resolve(disposedFailure());
      return Promise.resolve(fail(currentError("invalid-request", parsedRequest.error.message)));
    }
    if (disposed)
      return Promise.resolve(disposedFailure(null, null, parsedRequest.value));
    const requestCanonical = canonicalJson(parsedRequest.value);
    if (!requestCanonical.ok) {
      return Promise.resolve(fail(currentError("invalid-request", requestCanonical.error.message)));
    }
    if (disposed)
      return Promise.resolve(disposedFailure(null, null, parsedRequest.value));
    const step = parsedSteps.value[nextStep];
    if (step === undefined) {
      return Promise.resolve(fail(currentError("unexpected-request", "Transport received a request after its script was exhausted", nextStep, null, parsedRequest.value)));
    }
    if (requestCanonical.value !== step.requestCanonical) {
      return Promise.resolve(fail(currentError("request-mismatch", `Request does not match scripted step ${String(nextStep)}`, nextStep, step.request, parsedRequest.value)));
    }
    const stepIndex = nextStep;
    nextStep += 1;
    pending += 1;
    const lease = beginLease();
    if (!lease.ok) {
      pending -= 1;
      notifyIdle();
      if (disposed) {
        return Promise.resolve(disposedFailure(stepIndex, step.request, parsedRequest.value));
      }
      return Promise.resolve(fail(currentError("activity-failed", lease.error, stepIndex, step.request, parsedRequest.value)));
    }
    if (disposed) {
      settleLease(lease.value);
      pending -= 1;
      notifyIdle();
      return Promise.resolve(disposedFailure(stepIndex, step.request, parsedRequest.value));
    }
    return new Promise((resolve) => {
      let completed = false;
      let finalized = false;
      const finalize = (deliverAfterEvents) => {
        if (finalized)
          return;
        finalized = true;
        activeCancellations.delete(cancel);
        if (deliverAfterEvents && !disposed)
          emit(step.eventsAfter);
        settleLease(lease.value);
        if (pending > 0)
          pending -= 1;
        else
          recordInternalError("Transport pending-delivery accounting underflow");
        notifyIdle();
      };
      const scheduleFinalize = (deliverAfterEvents) => {
        try {
          queueMicrotask(() => finalize(deliverAfterEvents));
        } catch (reason) {
          recordInternalError(reason);
          finalize(deliverAfterEvents);
        }
      };
      const complete = (result, deliverAfterEvents) => {
        if (completed)
          return;
        completed = true;
        resolve(result);
        scheduleFinalize(deliverAfterEvents);
      };
      const completeTransportFailure = (code, message) => {
        complete(fail(currentError(code, message, stepIndex, step.request, parsedRequest.value)), false);
      };
      const cancel = () => {
        if (!completed) {
          completed = true;
          resolve(disposedFailure(stepIndex, step.request, parsedRequest.value));
        }
        finalize(false);
      };
      activeCancellations.add(cancel);
      if (disposed) {
        cancel();
        return;
      }
      const execute = async () => {
        if (!emit(step.eventsBefore)) {
          cancel();
          return;
        }
        let waited;
        try {
          waited = await options.runtime.wait(step.delayMs, disposalController.signal);
        } catch (reason) {
          if (disposed) {
            cancel();
            return;
          }
          completeTransportFailure("logical-wait-failed", `Logical wait failed: ${renderUnknownReason(reason, "Logical wait threw")}`);
          return;
        }
        if (disposed) {
          cancel();
          return;
        }
        if (!waited.ok) {
          completeTransportFailure("logical-wait-failed", runtimeFailureMessage(waited.error));
          return;
        }
        const outcome = step.outcome.kind === "response" ? ok(step.outcome.value) : err(Object.freeze({
          kind: "scripted",
          failure: step.outcome.error
        }));
        complete(outcome, true);
      };
      execute().catch((reason) => {
        completeTransportFailure("internal-failure", `Transport delivery failed: ${renderUnknownReason(reason)}`);
      });
    });
  };
  const assertNoInternalError = () => {
    const failure = internalError();
    return failure === null ? ok(true) : err(failure);
  };
  const transport = {
    request,
    subscribe: (listener) => {
      if (disposed)
        return () => {
          return;
        };
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active)
          return;
        active = false;
        listeners.delete(listener);
      };
    },
    dispose,
    isDisposed: () => disposed,
    remainingSteps,
    pendingDeliveries: () => pending,
    violationCount: () => internalErrors.length + droppedInternalErrors,
    whenIdle: async () => {
      while (pending !== 0) {
        await new Promise((resolve) => {
          idleWaiters.push(resolve);
        });
      }
      return assertNoInternalError();
    },
    assertDrained: () => {
      const failure = internalError();
      if (failure !== null)
        return err(failure);
      if (pending !== 0) {
        return err(currentError("pending-deliveries", `${String(pending)} transport deliveries are still pending`));
      }
      if (remainingSteps() !== 0) {
        return err(currentError("remaining-steps", `${String(remainingSteps())} scripted transport steps remain`));
      }
      return ok(true);
    }
  };
  return ok(Object.freeze(transport));
}
export {
  parseCarapaceProbeSnapshot,
  createExactScriptedTransport,
  createCarapaceSession,
  createCarapaceProbe,
  createCarapaceActivityScope,
  MAX_CARAPACE_PROBE_COUNTERS,
  DEFAULT_SCRIPTED_TRANSPORT_LIMITS,
  CARAPACE_PROBE_SCHEMA
};
