import type { CarapaceDefinition } from "../core/definition.js";
import type { JsonValue } from "../core/json-value.js";
import { renderUnknownReason } from "../core/reason.js";
import { err, ok, type Result } from "../core/result.js";
import {
  createLogicalRuntime,
  type LogicalRuntime,
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
  /** Register synchronous cleanup during product and observation construction. */
  readonly onDispose: (cleanup: CarapaceSessionCleanup) => void;
}

export interface CarapaceSessionObservation {
  readonly pending?: readonly CarapaceCounterSource[];
  readonly violations?: readonly CarapaceCounterSource[];
  readonly readRemainingWork?: () => unknown;
}

export interface CarapaceSessionOptions<
  World extends JsonValue,
  Route extends string,
  Product,
> {
  readonly definition: CarapaceDefinition<World, Route>;
  readonly activation: CarapaceSessionActivation;
  /** Runs synchronously. Carapace does not await a Promise returned as the product value. */
  readonly create: (context: CarapaceSessionContext<World, Route>) => Product;
  /** Runs synchronously after product construction. Omit when no additional counters are needed. */
  readonly observe?: (
    product: Product,
    context: CarapaceSessionContext<World, Route>,
  ) => CarapaceSessionObservation;
  readonly sleep?: LogicalSleep;
  readonly storeOptions?: CarapaceStoreOptions;
}

export type CarapaceSessionError =
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
    readonly code: "product-failed" | "observation-failed";
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
  Product,
> {
  readonly activation: ActiveCarapace<World, Route>;
  readonly world: World;
  readonly store: CarapaceStore<World>;
  readonly clock: LogicalRuntime;
  readonly activity: CarapaceActivityScope;
  readonly product: Product;
  readonly probe: CarapaceProbe;
  readonly signal: AbortSignal;
  /** Abort first, then invoke registered cleanup callbacks in reverse order. */
  readonly dispose: () => void;
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
    case "activation-failed":
    case "store-failed":
    case "product-failed":
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
 * cancellation, and teardown; the product factory owns its semantic ports.
 */
export function createCarapaceSession<
  World extends JsonValue,
  Route extends string,
  Product,
>(
  options: CarapaceSessionOptions<World, Route, Product>,
): Result<CarapaceSession<World, Route, Product>, CarapaceSessionError> {
  const activation = activateSession(options.definition, options.activation);
  if (!activation.ok) {
    return err(sessionError({
      code: "activation-failed",
      message: activation.error.message,
      queryError: activation.error,
      storeError: null,
      probeError: null,
    }));
  }

  const store = options.storeOptions === undefined
    ? createCarapaceStore(activation.value.world, options.definition.parseWorld)
    : createCarapaceStore(activation.value.world, options.definition.parseWorld, options.storeOptions);
  if (!store.ok) {
    return err(sessionError({
      code: "store-failed",
      message: store.error.message,
      queryError: null,
      storeError: store.error,
      probeError: null,
    }));
  }

  const clock = options.sleep === undefined
    ? createLogicalRuntime(activation.value.runtime)
    : createLogicalRuntime(activation.value.runtime, options.sleep);
  const activity = createCarapaceActivityScope(store.value, clock);
  const controller = new AbortController();
  const cleanups: CarapaceSessionCleanup[] = [];
  let registrationOpen = true;
  const context: CarapaceSessionContext<World, Route> = Object.freeze({
    activation: activation.value,
    world: activation.value.world,
    store: store.value,
    clock,
    activity,
    signal: controller.signal,
    onDispose: (cleanup: CarapaceSessionCleanup): void => {
      if (!registrationOpen) {
        throw new Error("Carapace cleanup must be registered during synchronous session construction");
      }
      cleanups.push(cleanup);
    },
  });

  let product: Product;
  try {
    product = options.create(context);
    if (isPromiseLike(product)) {
      void Promise.resolve(product).catch(() => undefined);
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
      probeError: null,
    }, cleanupErrors));
  }

  let observation: CarapaceSessionObservation;
  try {
    const observed = options.observe?.(product, context) ?? Object.freeze({});
    if (isPromiseLike(observed)) {
      void Promise.resolve(observed).catch(() => undefined);
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
      probeError: null,
    }, cleanupErrors));
  }
  registrationOpen = false;

  const probe = createCarapaceProbe({
    store: store.value,
    activationHash: activation.value.activationHash,
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
  const dispose = (): void => {
    if (disposed) return;
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
    disposalErrors: () => disposalErrors,
  }));
}
