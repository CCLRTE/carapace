import type { CarapaceDefinition } from "../core/definition.js";
import {
  createCoverageCatalogSnapshot,
  type CoverageCatalogSnapshot,
} from "../core/coverage.js";
import type { JsonValue } from "../core/json-value.js";
import { renderUnknownReason } from "../core/reason.js";
import { err, isRecord, ok, type Result } from "../core/result.js";
import {
  createLogicalRuntime,
  parseLogicalRuntimeSnapshot,
  type LogicalRuntime,
  type LogicalRuntimeSnapshot,
  type LogicalSleep,
} from "../core/runtime.js";
import {
  createCarapaceStore,
  type CarapaceStore,
  type CarapaceStoreOptions,
  type StoreError,
} from "../core/store.js";
import type { ActiveCarapace, QueryError } from "../core/query.js";
import { createCarapaceActivityScope, type CarapaceActivityScope } from "./activity.js";
import {
  createCarapaceProbe,
  type CarapaceCounterSource,
  type CarapaceProbe,
  type CarapaceProbeError,
} from "./probe.js";

/** A synchronous cleanup callback. Promise-returning teardown is intentionally unsupported. */
export type CarapaceSessionCleanup = () => undefined;

export interface CarapaceSessionRegistrationError {
  readonly code: "invalid-cleanup" | "session-disposed";
  readonly message: string;
}

export type CarapaceSessionActivation =
  | { readonly kind: "query"; readonly source: string }
  | { readonly kind: "scenario"; readonly scenario: unknown };

export interface CarapaceSessionContext<World extends JsonValue, Route extends string> {
  readonly activation: ActiveCarapace<World, Route>;
  readonly world: World;
  readonly store: CarapaceStore<World>;
  readonly clock: LogicalRuntime;
  readonly activity: CarapaceActivityScope;
  /** Aborted before registered cleanup callbacks run. */
  readonly signal: AbortSignal;
  /** Register synchronous cleanup during harness and observation construction. */
  readonly onDispose: (cleanup: CarapaceSessionCleanup) => undefined;
}

export interface CarapaceSessionObservation {
  readonly pending?: readonly CarapaceCounterSource[];
  readonly violations?: readonly CarapaceCounterSource[];
  readonly readRemainingWork?: () => JsonValue;
}

export interface CarapaceSessionOptions<
  World extends JsonValue,
  Route extends string,
  Harness,
> {
  readonly definition: CarapaceDefinition<World, Route>;
  readonly activation: CarapaceSessionActivation;
  /** Runs synchronously. Carapace does not await a Promise returned as the harness value. */
  readonly create: (context: CarapaceSessionContext<World, Route>) => Harness;
  /** Runs synchronously after harness construction. Omit when no additional counters are needed. */
  readonly observe?: (
    harness: Harness,
    context: CarapaceSessionContext<World, Route>,
  ) => CarapaceSessionObservation;
  readonly sleep?: LogicalSleep;
  readonly storeOptions?: CarapaceStoreOptions;
}

export type CarapaceSessionError =
  | {
    readonly code: "invalid-options";
    readonly message: string;
    readonly queryError: null;
    readonly storeError: null;
    readonly probeError: null;
    readonly cleanupErrors: readonly string[];
  }
  | {
    readonly code: "activation-failed";
    readonly message: string;
    readonly queryError: QueryError;
    readonly storeError: null;
    readonly probeError: null;
    readonly cleanupErrors: readonly string[];
  }
  | {
    readonly code: "store-failed";
    readonly message: string;
    readonly queryError: null;
    readonly storeError: StoreError;
    readonly probeError: null;
    readonly cleanupErrors: readonly string[];
  }
  | {
    readonly code: "harness-failed" | "observation-failed";
    readonly message: string;
    readonly queryError: null;
    readonly storeError: null;
    readonly probeError: null;
    readonly cleanupErrors: readonly string[];
  }
  | {
    readonly code: "probe-failed";
    readonly message: string;
    readonly queryError: null;
    readonly storeError: null;
    readonly probeError: CarapaceProbeError;
    readonly cleanupErrors: readonly string[];
  };

export interface CarapaceSession<
  World extends JsonValue,
  Route extends string,
  Harness,
> {
  readonly activation: ActiveCarapace<World, Route>;
  readonly world: World;
  readonly store: CarapaceStore<World>;
  readonly clock: LogicalRuntime;
  readonly activity: CarapaceActivityScope;
  /** The product-owned deterministic ports and controls created for this session. */
  readonly harness: Harness;
  readonly probe: CarapaceProbe;
  /** Exact, versioned proof catalog ready for the browser bridge. */
  readonly coverage: CoverageCatalogSnapshot;
  readonly signal: AbortSignal;
  /** Register additional synchronous teardown until the session is disposed. */
  readonly onDispose: (
    cleanup: CarapaceSessionCleanup,
  ) => Result<true, CarapaceSessionRegistrationError>;
  /** Abort first, then invoke registered cleanup callbacks in reverse order. */
  readonly dispose: () => undefined;
  readonly isDisposed: () => boolean;
  /** Cleanup failures are diagnostics; disposal still attempts every callback. */
  readonly disposalErrors: () => readonly string[];
}

function frozenMessages(messages: readonly string[]): readonly string[] {
  return Object.freeze([...messages]);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  ) && typeof Reflect.get(value, "then") === "function";
}

function freezeCounterSources(
  sources: readonly CarapaceCounterSource[],
): readonly CarapaceCounterSource[] {
  return Object.freeze([...sources]);
}

function prepareSessionObservation(
  input: CarapaceSessionObservation,
): CarapaceSessionObservation {
  const candidate: unknown = input;
  if (!isRecord(candidate)) {
    throw new Error("Carapace observation must be an object");
  }
  const pending = input.pending;
  const violations = input.violations;
  const readRemainingWork = input.readRemainingWork;
  if (pending !== undefined && !Array.isArray(pending)) {
    throw new Error("Carapace observation pending counters must be an array");
  }
  if (violations !== undefined && !Array.isArray(violations)) {
    throw new Error("Carapace observation violation counters must be an array");
  }
  if (readRemainingWork !== undefined && typeof readRemainingWork !== "function") {
    throw new Error("Carapace observation remaining-work reader must be a function");
  }
  return Object.freeze({
    ...(pending === undefined ? {} : { pending: freezeCounterSources(pending) }),
    ...(violations === undefined ? {} : { violations: freezeCounterSources(violations) }),
    ...(readRemainingWork === undefined ? {} : { readRemainingWork }),
  });
}

type SessionErrorWithoutCleanup = CarapaceSessionError extends infer Failure
  ? Failure extends CarapaceSessionError
    ? Omit<Failure, "cleanupErrors">
    : never
  : never;

function sessionError(
  error: SessionErrorWithoutCleanup,
  cleanupErrors: readonly string[] = [],
): CarapaceSessionError {
  const failures = frozenMessages(cleanupErrors);
  switch (error.code) {
    case "invalid-options":
    case "activation-failed":
    case "store-failed":
    case "harness-failed":
    case "observation-failed":
    case "probe-failed":
      return Object.freeze({ ...error, cleanupErrors: failures });
  }
}

function runCleanup(
  controller: AbortController,
  cleanups: readonly CarapaceSessionCleanup[],
): readonly string[] {
  const failures: string[] = [];
  try {
    controller.abort();
  } catch (reason) {
    failures.push(`Abort failed: ${renderUnknownReason(reason)}`);
  }
  for (const cleanup of [...cleanups].reverse()) {
    try {
      const returned: unknown = cleanup();
      if (returned !== undefined) {
        if (isPromiseLike(returned)) {
          void Promise.resolve(returned).catch(() => undefined);
        }
        failures.push("Carapace cleanup must complete synchronously and return undefined");
      }
    } catch (reason) {
      failures.push(renderUnknownReason(reason, "Carapace cleanup failed"));
    }
  }
  return frozenMessages(failures);
}

function activateSession<World extends JsonValue, Route extends string>(
  definition: CarapaceDefinition<World, Route>,
  activation: CarapaceSessionActivation,
): Result<ActiveCarapace<World, Route>, QueryError> {
  switch (activation.kind) {
    case "query":
      return definition.activate(activation.source);
    case "scenario":
      return definition.activateScenario(activation.scenario);
  }
}

/**
 * Construct one product-owned deterministic composition around a validated
 * definition. Carapace owns activation, logical time, activity, observation,
 * cancellation, and teardown; the harness factory owns product semantic ports.
 */
export function createCarapaceSession<
  World extends JsonValue,
  Route extends string,
  Harness,
>(
  options: CarapaceSessionOptions<World, Route, Harness>,
): Result<CarapaceSession<World, Route, Harness>, CarapaceSessionError> {
  let definition: CarapaceDefinition<World, Route>;
  let requestedActivation: CarapaceSessionActivation;
  let createHarness: CarapaceSessionOptions<World, Route, Harness>["create"];
  let observeHarness: CarapaceSessionOptions<World, Route, Harness>["observe"];
  let parseWorld: CarapaceDefinition<World, Route>["parseWorld"];
  let coverage: CoverageCatalogSnapshot;
  let sleep: LogicalSleep | undefined;
  let storeOptions: CarapaceStoreOptions | undefined;
  try {
    definition = options.definition;
    parseWorld = definition.parseWorld;
    coverage = createCoverageCatalogSnapshot(definition.coverage);
    const activationInput = options.activation;
    if (activationInput.kind === "query") {
      requestedActivation = Object.freeze({ kind: "query", source: activationInput.source });
    } else if (activationInput.kind === "scenario") {
      requestedActivation = Object.freeze({ kind: "scenario", scenario: activationInput.scenario });
    } else {
      throw new Error("Carapace session activation kind must be query or scenario");
    }
    createHarness = options.create;
    observeHarness = options.observe;
    sleep = options.sleep;
    const storeOptionsInput = options.storeOptions;
    if (storeOptionsInput === undefined) {
      storeOptions = undefined;
    } else {
      const onListenerError = storeOptionsInput.onListenerError;
      storeOptions = Object.freeze({
        ...(onListenerError === undefined ? {} : { onListenerError }),
      });
    }
  } catch (reason) {
    return err(sessionError({
      code: "invalid-options",
      message: renderUnknownReason(reason, "Carapace session options could not be inspected"),
      queryError: null,
      storeError: null,
      probeError: null,
    }));
  }

  let activationSource: ActiveCarapace<World, Route>["source"];
  let activationScenario: ActiveCarapace<World, Route>["scenario"];
  let activationRoute: Route;
  let activationWorld: World;
  let activationRuntime: LogicalRuntimeSnapshot;
  let activationHash: string;
  try {
    const activated = activateSession(definition, requestedActivation);
    if (!activated.ok) {
      const queryError: QueryError = Object.freeze({
        code: activated.error.code,
        message: activated.error.message,
      });
      return err(sessionError({
        code: "activation-failed",
        message: queryError.message,
        queryError,
        storeError: null,
        probeError: null,
      }));
    }
    const candidate = activated.value;
    if (candidate.kind !== "active") throw new Error("Carapace activation kind must be active");
    if (candidate.source !== "scenario" && candidate.source !== "fixture") {
      throw new Error("Carapace activation source must be scenario or fixture");
    }
    if (typeof candidate.scenario !== "string") {
      throw new Error("Carapace activation scenario must be a string");
    }
    if (typeof candidate.route !== "string") {
      throw new Error("Carapace activation route must be a string");
    }
    if (typeof candidate.activationHash !== "string" || candidate.activationHash.length === 0) {
      throw new Error("Carapace activation hash must be a non-empty string");
    }
    const parsedRuntime = parseLogicalRuntimeSnapshot(candidate.runtime);
    if (!parsedRuntime.ok) throw new Error(parsedRuntime.error.message);
    activationSource = candidate.source;
    activationScenario = candidate.scenario;
    activationRoute = candidate.route;
    activationWorld = candidate.world;
    activationRuntime = parsedRuntime.value;
    activationHash = candidate.activationHash;
  } catch (reason) {
    return err(sessionError({
      code: "invalid-options",
      message: renderUnknownReason(reason, "Carapace session activation failed unexpectedly"),
      queryError: null,
      storeError: null,
      probeError: null,
    }));
  }

  const store = storeOptions === undefined
    ? createCarapaceStore(activationWorld, parseWorld)
    : createCarapaceStore(activationWorld, parseWorld, storeOptions);
  if (!store.ok) {
    return err(sessionError({
      code: "store-failed",
      message: store.error.message,
      queryError: null,
      storeError: store.error,
      probeError: null,
    }));
  }

  const clock = sleep === undefined
    ? createLogicalRuntime(activationRuntime)
    : createLogicalRuntime(activationRuntime, sleep);
  const activation: ActiveCarapace<World, Route> = Object.freeze({
    kind: "active",
    source: activationSource,
    scenario: activationScenario,
    route: activationRoute,
    world: store.value.getSnapshot().world,
    runtime: clock.snapshot(),
    activationHash,
  });
  const controller = new AbortController();
  const activity = createCarapaceActivityScope(store.value, clock, { signal: controller.signal });
  const cleanups: CarapaceSessionCleanup[] = [];
  let registrationOpen = true;
  const context: CarapaceSessionContext<World, Route> = Object.freeze({
    activation,
    world: activation.world,
    store: store.value,
    clock,
    activity,
    signal: controller.signal,
    onDispose: (cleanup: CarapaceSessionCleanup): undefined => {
      if (!registrationOpen) {
        throw new Error("Carapace cleanup must be registered during synchronous session construction");
      }
      cleanups.push(cleanup);
      return undefined;
    },
  });

  let harness: Harness;
  try {
    harness = createHarness(context);
    if (isPromiseLike(harness)) {
      void Promise.resolve(harness).catch(() => undefined);
      throw new Error("Carapace harness construction must complete synchronously");
    }
  } catch (reason) {
    registrationOpen = false;
    const cleanupErrors = runCleanup(controller, cleanups);
    return err(sessionError({
      code: "harness-failed",
      message: renderUnknownReason(reason, "Carapace harness construction failed"),
      queryError: null,
      storeError: null,
      probeError: null,
    }, cleanupErrors));
  }

  let observation: CarapaceSessionObservation;
  try {
    const observed = observeHarness === undefined
      ? Object.freeze({})
      : observeHarness(harness, context);
    if (isPromiseLike(observed)) {
      void Promise.resolve(observed).catch(() => undefined);
      throw new Error("Carapace observation construction must complete synchronously");
    }
    observation = prepareSessionObservation(observed);
  } catch (reason) {
    registrationOpen = false;
    const cleanupErrors = runCleanup(controller, cleanups);
    return err(sessionError({
      code: "observation-failed",
      message: renderUnknownReason(reason, "Carapace observation construction failed"),
      queryError: null,
      storeError: null,
      probeError: null,
    }, cleanupErrors));
  }
  registrationOpen = false;

  const probe = createCarapaceProbe({
    store: store.value,
    activationHash: activation.activationHash,
    ...(observation.pending === undefined ? {} : { pending: observation.pending }),
    ...(observation.violations === undefined ? {} : { violations: observation.violations }),
    ...(observation.readRemainingWork === undefined
      ? {}
      : { readRemainingWork: observation.readRemainingWork }),
  });
  if (!probe.ok) {
    const cleanupErrors = runCleanup(controller, cleanups);
    return err(sessionError({
      code: "probe-failed",
      message: probe.error.message,
      queryError: null,
      storeError: null,
      probeError: probe.error,
    }, cleanupErrors));
  }

  let disposed = false;
  let disposalErrors: readonly string[] = Object.freeze([]);
  const onDispose = (
    cleanup: CarapaceSessionCleanup,
  ): Result<true, CarapaceSessionRegistrationError> => {
    if (typeof cleanup !== "function") {
      return err(Object.freeze({
        code: "invalid-cleanup",
        message: "Carapace cleanup must be a function",
      }));
    }
    if (disposed) {
      return err(Object.freeze({
        code: "session-disposed",
        message: "Cannot register cleanup on a disposed Carapace session",
      }));
    }
    cleanups.push(cleanup);
    return ok<true>(true);
  };
  const dispose = (): undefined => {
    if (disposed) return undefined;
    disposed = true;
    disposalErrors = runCleanup(controller, cleanups);
    return undefined;
  };

  return ok(Object.freeze({
    activation,
    world: activation.world,
    store: store.value,
    clock,
    activity,
    harness,
    probe: probe.value,
    coverage,
    signal: controller.signal,
    onDispose,
    dispose,
    isDisposed: () => disposed,
    disposalErrors: () => disposalErrors,
  }));
}
