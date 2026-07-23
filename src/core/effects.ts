import { parseOperationId, type OperationId } from "./ids.js";
import { cloneJson, freezeJson } from "./json.js";
import type { JsonValue } from "./json-value.js";

export interface QueuedEffect<Effect extends JsonValue> {
  readonly id: OperationId;
  readonly effect: Effect;
  readonly remaining: number;
}

export type QueuedFault<Fault extends JsonValue> = QueuedEffect<Fault>;

export type ConsumedEffect<Effect extends JsonValue> =
  | {
    readonly kind: "consumed";
    readonly effect: Effect;
    readonly queue: readonly QueuedEffect<Effect>[];
  }
  | {
    readonly kind: "empty";
    readonly queue: readonly QueuedEffect<Effect>[];
  };

function ownQueuedEffect<Effect extends JsonValue>(
  entry: QueuedEffect<Effect>,
): QueuedEffect<Effect> {
  const id = parseOperationId(entry.id);
  if (!id.ok) throw new Error(id.error.message);
  if (!Number.isSafeInteger(entry.remaining) || entry.remaining < 1) {
    throw new Error("Queued effect remaining uses must be a positive safe integer");
  }
  const cloned = cloneJson(entry.effect);
  if (!cloned.ok) throw new Error(cloned.error.message);
  return Object.freeze({
    id: id.value,
    effect: freezeJson(cloned.value) as Effect,
    remaining: entry.remaining,
  });
}

function ownEffectQueue<Effect extends JsonValue>(
  queue: readonly QueuedEffect<Effect>[],
): readonly QueuedEffect<Effect>[] {
  return Object.freeze(queue.map((entry) => ownQueuedEffect(entry)));
}

export function enqueueEffect<Effect extends JsonValue>(
  queue: readonly QueuedEffect<Effect>[],
  id: OperationId,
  effect: Effect,
  uses = 1,
): readonly QueuedEffect<Effect>[] {
  if (!Number.isSafeInteger(uses) || uses < 1) {
    throw new Error("Queued effect uses must be a positive safe integer");
  }
  const ownedQueue = ownEffectQueue(queue);
  const appended = ownQueuedEffect({ id, effect, remaining: uses });
  return Object.freeze([...ownedQueue, appended]);
}

export function consumeEffect<Effect extends JsonValue>(
  queue: readonly QueuedEffect<Effect>[],
  matches: (entry: QueuedEffect<Effect>) => boolean = () => true,
): ConsumedEffect<Effect> {
  const ownedQueue = ownEffectQueue(queue);
  const index = ownedQueue.findIndex(matches);
  if (index < 0) {
    return Object.freeze({ kind: "empty", queue: ownedQueue });
  }
  const matched = ownedQueue[index];
  if (matched === undefined) {
    return Object.freeze({ kind: "empty", queue: ownedQueue });
  }
  const next = [...ownedQueue];
  if (matched.remaining === 1) {
    next.splice(index, 1);
  } else {
    next[index] = Object.freeze({ ...matched, remaining: matched.remaining - 1 });
  }
  return Object.freeze({
    kind: "consumed",
    effect: matched.effect,
    queue: Object.freeze(next),
  });
}

export const enqueueFault = enqueueEffect;
export const consumeFault = consumeEffect;
