import { parseOperationId, type OperationId } from "./ids.js";
import { cloneJson, parseAndCloneWorld, type WorldParser } from "./json.js";
import type { JsonValue } from "./json-value.js";
import { renderUnknownReason } from "./reason.js";
import { err, ok, type Result } from "./result.js";

declare const generationBrand: unique symbol;
export type StoreGeneration = number & { readonly [generationBrand]: "StoreGeneration" };

export interface ActivitySnapshot {
  readonly active: number;
  readonly started: number;
  readonly settled: number;
}

export interface CarapaceStoreSnapshot<World extends JsonValue> {
  readonly generation: StoreGeneration;
  readonly revision: number;
  readonly world: World;
  readonly activity: ActivitySnapshot;
}

export type StoreErrorCode =
  | "activity-not-found"
  | "duplicate-activity"
  | "generation-overflow"
  | "invalid-operation"
  | "invalid-world"
  | "stale-generation"
  | "transaction-failed";

export interface StoreError {
  readonly code: StoreErrorCode;
  readonly message: string;
  readonly operation: OperationId | null;
}

export interface TypedActivityLease<World extends JsonValue> {
  readonly generation: StoreGeneration;
  readonly operation: OperationId;
  readonly settle: () => Result<CarapaceStoreSnapshot<World>, StoreError>;
}

export interface CarapaceStore<World extends JsonValue> {
  readonly getSnapshot: () => CarapaceStoreSnapshot<World>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly transact: (
    generation: StoreGeneration,
    operation: OperationId,
    update: (draft: World) => World | void,
  ) => Result<CarapaceStoreSnapshot<World>, StoreError>;
  readonly reset: (world: World) => Result<CarapaceStoreSnapshot<World>, StoreError>;
  readonly beginActivity: (
    generation: StoreGeneration,
    operation: OperationId,
  ) => Result<TypedActivityLease<World>, StoreError>;
  readonly settleActivity: (
    generation: StoreGeneration,
    operation: OperationId,
  ) => Result<CarapaceStoreSnapshot<World>, StoreError>;
  readonly isQuiescent: (generation: StoreGeneration) => Result<boolean, StoreError>;
  readonly whenQuiescent: (
    generation: StoreGeneration,
  ) => Promise<Result<CarapaceStoreSnapshot<World>, StoreError>>;
}

export interface CarapaceStoreOptions {
  /** Listener failures are isolated from committed state and reported here. */
  readonly onListenerError?: (reason: unknown) => void;
}

function storeError(code: StoreErrorCode, message: string, operation: OperationId | null = null): StoreError {
  return { code, message, operation };
}

function generation(value: number): StoreGeneration {
  return value as StoreGeneration;
}

function activity(active: number, started: number, settled: number): ActivitySnapshot {
  return Object.freeze({ active, started, settled });
}

function storeSnapshot<World extends JsonValue>(
  currentGeneration: StoreGeneration,
  revision: number,
  world: World,
  currentActivity: ActivitySnapshot,
): CarapaceStoreSnapshot<World> {
  return Object.freeze({ generation: currentGeneration, revision, world, activity: currentActivity });
}

export function createCarapaceStore<World extends JsonValue>(
  initialWorld: World,
  parseWorld: WorldParser<World>,
  options: CarapaceStoreOptions = {},
): Result<CarapaceStore<World>, StoreError> {
  const initial = parseAndCloneWorld(initialWorld, parseWorld);
  if (!initial.ok) {
    return err(storeError("invalid-world", initial.error.message));
  }

  let currentGeneration = generation(1);
  let revision = 0;
  let currentActivity = activity(0, 0, 0);
  let snapshot = storeSnapshot(currentGeneration, revision, initial.value, currentActivity);
  const listeners = new Set<() => void>();
  const activeOperations = new Set<OperationId>();

  const publish = (world: World = snapshot.world): CarapaceStoreSnapshot<World> => {
    revision += 1;
    snapshot = storeSnapshot(currentGeneration, revision, world, currentActivity);
    for (const listener of listeners) {
      try {
        listener();
      } catch (reason) {
        try {
          options.onListenerError?.(reason);
        } catch {
          // A reporter is another listener boundary and cannot roll back committed state.
        }
      }
    }
    return snapshot;
  };

  const stale = (expected: StoreGeneration, operation: OperationId | null = null): StoreError | null => (
    expected === currentGeneration
      ? null
      : storeError(
        "stale-generation",
        `Generation ${String(expected)} is stale; current generation is ${String(currentGeneration)}`,
        operation,
      )
  );

  const validateOperation = (candidate: OperationId): Result<OperationId, StoreError> => {
    const parsed = parseOperationId(candidate);
    return parsed.ok
      ? ok(parsed.value)
      : err(storeError("invalid-operation", parsed.error.message));
  };

  const settleActivity = (
    expected: StoreGeneration,
    candidate: OperationId,
  ): Result<CarapaceStoreSnapshot<World>, StoreError> => {
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
    currentActivity = activity(
      currentActivity.active - 1,
      currentActivity.started,
      currentActivity.settled + 1,
    );
    return ok(publish());
  };

  const store: CarapaceStore<World> = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
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
      let candidateWorld: World;
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
      currentActivity = activity(
        currentActivity.active + 1,
        currentActivity.started + 1,
        currentActivity.settled,
      );
      publish();
      const lease: TypedActivityLease<World> = Object.freeze({
        generation: expected,
        operation: operation.value,
        settle: () => settleActivity(expected, operation.value),
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
    },
  };

  return ok(Object.freeze(store));
}
