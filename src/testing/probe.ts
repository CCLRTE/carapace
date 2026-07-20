import { cloneJson, freezeJson, parseJsonValue } from "../core/json.js";
import type { JsonValue } from "../core/json-value.js";
import { renderUnknownReason } from "../core/reason.js";
import { err, isRecord, ok, type Result } from "../core/result.js";
import type { ActivitySnapshot, CarapaceStore } from "../core/store.js";

export const CARAPACE_PROBE_SCHEMA = "carapace.probe/v1" as const;
export const MAX_CARAPACE_PROBE_COUNTERS = 128;

export interface CarapaceCounterSource {
  readonly name: string;
  /** Foreign counter reads are validated on every snapshot. */
  readonly read: () => unknown;
}

export interface CarapaceProbeSnapshot {
  readonly schema: typeof CARAPACE_PROBE_SCHEMA;
  readonly activationHash: string;
  readonly generation: number;
  readonly revision: number;
  readonly activity: ActivitySnapshot;
  readonly pending: Readonly<Record<string, number>>;
  readonly violations: Readonly<Record<string, number>>;
  /** Diagnostic only: remaining scripted work does not prevent quiescence. */
  readonly remainingWork: JsonValue;
  readonly isQuiescent: boolean;
}

export type CarapaceProbeErrorCode =
  | "duplicate-counter"
  | "invalid-activation-hash"
  | "invalid-counter"
  | "invalid-counter-name"
  | "invalid-remaining-work"
  | "invalid-snapshot"
  | "probe-read-failed"
  | "too-many-counters";

export interface CarapaceProbeError {
  readonly code: CarapaceProbeErrorCode;
  readonly message: string;
  readonly counter: string | null;
}

export interface CarapaceProbe {
  readonly snapshot: () => Result<CarapaceProbeSnapshot, CarapaceProbeError>;
  readonly isQuiescent: () => Result<boolean, CarapaceProbeError>;
}

export interface CarapaceProbeOptions<World extends JsonValue> {
  readonly store: CarapaceStore<World>;
  readonly activationHash: string;
  readonly pending?: readonly CarapaceCounterSource[];
  readonly violations?: readonly CarapaceCounterSource[];
  readonly readRemainingWork?: () => unknown;
}

interface PreparedCounterSource extends CarapaceCounterSource {
  readonly category: "pending" | "violation";
}

const COUNTER_NAME_PATTERN = /^[a-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$/u;
const SNAPSHOT_KEYS = new Set([
  "schema",
  "activationHash",
  "generation",
  "revision",
  "activity",
  "pending",
  "violations",
  "remainingWork",
  "isQuiescent",
]);
const ACTIVITY_KEYS = new Set(["active", "started", "settled"]);

function probeError(
  code: CarapaceProbeErrorCode,
  message: string,
  counter: string | null = null,
): CarapaceProbeError {
  return Object.freeze({ code, message, counter });
}

function validActivationHash(value: string): boolean {
  if (value.length === 0 || value.length > 256) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

function readNonNegativeInteger(input: unknown): number | null {
  return typeof input === "number" && Number.isSafeInteger(input) && input >= 0
    ? input
    : null;
}

function parseSnapshotCounters(
  input: unknown,
  category: "pending" | "violation",
): Result<Readonly<Record<string, number>>, CarapaceProbeError> {
  if (!isRecord(input)) {
    return err(probeError("invalid-snapshot", `Probe ${category} counters must be an object`));
  }
  const output: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const [name, candidate] of Object.entries(input)) {
    if (name.length > 80 || !COUNTER_NAME_PATTERN.test(name)) {
      return err(probeError(
        "invalid-counter-name",
        "Counter names must be 1-80 ASCII alphanumeric characters with optional dots or hyphens",
        name,
      ));
    }
    const value = readNonNegativeInteger(candidate);
    if (value === null) {
      return err(probeError(
        "invalid-counter",
        `Counter ${name} must be a non-negative safe integer`,
        name,
      ));
    }
    output[name] = value;
  }
  return ok(Object.freeze(output));
}

/** Parse the versioned JSON value returned by a browser bridge from `unknown`. */
export function parseCarapaceProbeSnapshot(
  input: unknown,
): Result<CarapaceProbeSnapshot, CarapaceProbeError> {
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !isRecord(parsed.value)) {
    return err(probeError(
      "invalid-snapshot",
      parsed.ok ? "Carapace probe snapshot must be an object" : parsed.error.message,
    ));
  }
  const record = parsed.value;
  for (const key of Object.keys(record)) {
    if (!SNAPSHOT_KEYS.has(key)) {
      return err(probeError("invalid-snapshot", `Unknown Carapace probe snapshot key: ${key}`));
    }
  }
  if (record.schema !== CARAPACE_PROBE_SCHEMA) {
    return err(probeError(
      "invalid-snapshot",
      `Carapace probe schema must be ${CARAPACE_PROBE_SCHEMA}`,
    ));
  }
  if (typeof record.activationHash !== "string" || !validActivationHash(record.activationHash)) {
    return err(probeError("invalid-activation-hash", "Carapace probe activation hash is invalid"));
  }
  const generation = readNonNegativeInteger(record.generation);
  const revision = readNonNegativeInteger(record.revision);
  if (generation === null || generation < 1 || revision === null) {
    return err(probeError(
      "invalid-snapshot",
      "Carapace probe generation must be positive and revision must be non-negative",
    ));
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
  if (
    active === null
    || started === null
    || settled === null
    || settled > started
    || active !== started - settled
  ) {
    return err(probeError(
      "invalid-snapshot",
      "Carapace activity counters must be non-negative and conserve started work",
    ));
  }
  const pending = parseSnapshotCounters(record.pending, "pending");
  if (!pending.ok) return pending;
  const violations = parseSnapshotCounters(record.violations, "violation");
  if (!violations.ok) return violations;
  if (Object.keys(pending.value).length + Object.keys(violations.value).length > MAX_CARAPACE_PROBE_COUNTERS) {
    return err(probeError(
      "too-many-counters",
      `A probe supports at most ${String(MAX_CARAPACE_PROBE_COUNTERS)} counters`,
    ));
  }
  if (record.remainingWork === undefined) {
    return err(probeError("invalid-snapshot", "Carapace probe snapshot requires remainingWork"));
  }
  if (typeof record.isQuiescent !== "boolean") {
    return err(probeError("invalid-snapshot", "Carapace probe isQuiescent must be boolean"));
  }
  const expectedQuiescence = active === 0
    && Object.values(pending.value).every((value) => value === 0);
  if (record.isQuiescent !== expectedQuiescence) {
    return err(probeError(
      "invalid-snapshot",
      "Carapace probe isQuiescent does not match its activity and pending counters",
    ));
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
    isQuiescent: record.isQuiescent,
  }));
}

function prepareCounters(
  pending: readonly CarapaceCounterSource[],
  violations: readonly CarapaceCounterSource[],
): Result<readonly PreparedCounterSource[], CarapaceProbeError> {
  if (pending.length + violations.length > MAX_CARAPACE_PROBE_COUNTERS) {
    return err(probeError(
      "too-many-counters",
      `A probe supports at most ${String(MAX_CARAPACE_PROBE_COUNTERS)} counters`,
    ));
  }
  const prepared: PreparedCounterSource[] = [];
  const seen = new Set<string>();
  for (const [category, sources] of [
    ["pending", pending],
    ["violation", violations],
  ] as const) {
    for (const source of sources) {
      if (source.name.length > 80 || !COUNTER_NAME_PATTERN.test(source.name)) {
        return err(probeError(
          "invalid-counter-name",
          "Counter names must be 1-80 ASCII alphanumeric characters with optional dots or hyphens",
          source.name,
        ));
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

function readCounters(
  sources: readonly PreparedCounterSource[],
): Result<{
  readonly pending: Readonly<Record<string, number>>;
  readonly violations: Readonly<Record<string, number>>;
}, CarapaceProbeError> {
  const pending: Record<string, number> = Object.create(null) as Record<string, number>;
  const violations: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const source of sources) {
    let value: unknown;
    try {
      value = source.read();
    } catch (reason) {
      return err(probeError(
        "probe-read-failed",
        renderUnknownReason(reason, `Failed to read ${source.name}`),
        source.name,
      ));
    }
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      return err(probeError(
        "invalid-counter",
        `Counter ${source.name} must be a non-negative safe integer`,
        source.name,
      ));
    }
    (source.category === "pending" ? pending : violations)[source.name] = value;
  }
  return ok({ pending: Object.freeze(pending), violations: Object.freeze(violations) });
}

function readRemaining(read: () => unknown): Result<JsonValue, CarapaceProbeError> {
  let candidate: unknown;
  try {
    candidate = read();
  } catch (reason) {
    return err(probeError(
      "probe-read-failed",
      renderUnknownReason(reason, "Failed to read remaining work"),
    ));
  }
  const cloned = cloneJson(candidate);
  return cloned.ok
    ? ok(freezeJson(cloned.value))
    : err(probeError("invalid-remaining-work", cloned.error.message));
}

/** Build a stable, JSON-safe verifier view without publishing the product world. */
export function createCarapaceProbe<World extends JsonValue>(
  options: CarapaceProbeOptions<World>,
): Result<CarapaceProbe, CarapaceProbeError> {
  if (!validActivationHash(options.activationHash)) {
    return err(probeError(
      "invalid-activation-hash",
      "Activation hashes must be 1-256 characters without control characters",
    ));
  }
  const counters = prepareCounters(options.pending ?? [], options.violations ?? []);
  if (!counters.ok) return counters;
  const readRemainingWork = options.readRemainingWork ?? (() => Object.freeze({}));

  const snapshot = (): Result<CarapaceProbeSnapshot, CarapaceProbeError> => {
    const read = readCounters(counters.value);
    if (!read.ok) return read;
    const remaining = readRemaining(readRemainingWork);
    if (!remaining.ok) return remaining;
    const storeSnapshot = options.store.getSnapshot();
    const isQuiescent = storeSnapshot.activity.active === 0
      && Object.values(read.value.pending).every((value) => value === 0);
    const value = {
      schema: CARAPACE_PROBE_SCHEMA,
      activationHash: options.activationHash,
      generation: Number(storeSnapshot.generation),
      revision: storeSnapshot.revision,
      activity: storeSnapshot.activity,
      pending: read.value.pending,
      violations: read.value.violations,
      remainingWork: remaining.value,
      isQuiescent,
    } satisfies CarapaceProbeSnapshot;
    return ok(Object.freeze(value));
  };

  const probe: CarapaceProbe = {
    snapshot,
    isQuiescent: () => {
      const current = snapshot();
      return current.ok ? ok(current.value.isQuiescent) : current;
    },
  };
  return ok(Object.freeze(probe));
}
