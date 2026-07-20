import type { OperationId } from "./ids.js";
import { cloneJson, freezeJson } from "./json.js";
import type { JsonValue } from "./json-value.js";

export interface QueuedEffect<Effect extends JsonValue> {
  readonly id: OperationId;
  readonly effect: Effect;
  readonly remaining: number;
}

export type QueuedFault<Fault extends JsonValue> = QueuedEffect<Fault>;

export interface ConsumedEffect<Effect extends JsonValue> {
  readonly effect: Effect | null;
  readonly queue: readonly QueuedEffect<Effect>[];
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
  const cloned = cloneJson(effect);
  if (!cloned.ok) throw new Error(cloned.error.message);
  const owned = freezeJson(cloned.value) as Effect;
  return Object.freeze([...queue, Object.freeze({ id, effect: owned, remaining: uses })]);
}

export function consumeEffect<Effect extends JsonValue>(
  queue: readonly QueuedEffect<Effect>[],
  matches: (entry: QueuedEffect<Effect>) => boolean = () => true,
): ConsumedEffect<Effect> {
  const index = queue.findIndex(matches);
  if (index < 0) {
    return { effect: null, queue };
  }
  const matched = queue[index];
  if (matched === undefined) {
    return { effect: null, queue };
  }
  const next = [...queue];
  if (matched.remaining === 1) {
    next.splice(index, 1);
  } else {
    next[index] = Object.freeze({ ...matched, remaining: matched.remaining - 1 });
  }
  return { effect: matched.effect, queue: Object.freeze(next) };
}

export const enqueueFault = enqueueEffect;
export const consumeFault = consumeEffect;
