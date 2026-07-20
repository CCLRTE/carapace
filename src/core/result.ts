/** An explicit success-or-failure value whose failure path stays visible. */
export type Result<Value, Failure = Error> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: Failure };

export type UnknownRecord = Record<string, unknown>;

export function ok<Value>(value: Value): Result<Value, never> {
  return { ok: true, value };
}

export function err<Failure>(error: Failure): Result<never, Failure> {
  return { ok: false, error };
}

/** Narrow a foreign value before reading named fields from it. */
export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
