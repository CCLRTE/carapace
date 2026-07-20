import type { JsonObject, JsonValue } from "./json-value.js";
import { renderUnknownReason } from "./reason.js";
import { err, ok, type Result } from "./result.js";

export interface JsonLimits {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxStringBytes: number;
}

export const DEFAULT_JSON_LIMITS = Object.freeze({
  maxDepth: 64,
  maxNodes: 100_000,
  maxStringBytes: 1_048_576,
}) satisfies JsonLimits;

export type JsonBoundaryErrorCode =
  | "accessor-property"
  | "cycle"
  | "depth-exceeded"
  | "invalid-number"
  | "invalid-object"
  | "invalid-type"
  | "node-limit-exceeded"
  | "string-limit-exceeded"
  | "symbol-key";

export interface JsonBoundaryError {
  readonly code: JsonBoundaryErrorCode;
  readonly path: string;
  readonly message: string;
}

interface JsonBudget {
  nodes: number;
  stringBytes: number;
}

function jsonError(code: JsonBoundaryErrorCode, path: string, message: string): JsonBoundaryError {
  return { code, path, message };
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function parseJsonAt(
  input: unknown,
  path: string,
  depth: number,
  limits: JsonLimits,
  budget: JsonBudget,
  ancestors: ReadonlySet<object>,
): Result<JsonValue, JsonBoundaryError> {
  budget.nodes += 1;
  if (budget.nodes > limits.maxNodes) {
    return err(jsonError("node-limit-exceeded", path, `JSON value exceeds ${limits.maxNodes} nodes`));
  }
  if (depth > limits.maxDepth) {
    return err(jsonError("depth-exceeded", path, `JSON value exceeds depth ${limits.maxDepth}`));
  }
  if (input === null || typeof input === "boolean") {
    return ok(input);
  }
  if (typeof input === "string") {
    budget.stringBytes += utf8ByteLength(input);
    if (budget.stringBytes > limits.maxStringBytes) {
      return err(jsonError("string-limit-exceeded", path, `JSON strings exceed ${limits.maxStringBytes} UTF-8 bytes`));
    }
    return ok(input);
  }
  if (typeof input === "number") {
    return Number.isFinite(input)
      ? ok(input)
      : err(jsonError("invalid-number", path, "JSON numbers must be finite"));
  }
  if (typeof input !== "object") {
    return err(jsonError("invalid-type", path, `${typeof input} is not a JSON value`));
  }
  if (ancestors.has(input)) {
    return err(jsonError("cycle", path, "JSON values cannot contain cycles"));
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(input);

  if (Array.isArray(input)) {
    if (Object.getPrototypeOf(input) !== Array.prototype) {
      return err(jsonError("invalid-object", path, "JSON arrays must have the standard Array prototype"));
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
    if (
      lengthDescriptor === undefined
      || lengthDescriptor.get !== undefined
      || lengthDescriptor.set !== undefined
      || !Number.isSafeInteger(lengthDescriptor.value)
      || (lengthDescriptor.value as number) < 0
    ) {
      return err(jsonError("invalid-object", path, "JSON arrays must have a valid data length"));
    }
    const length = lengthDescriptor.value as number;
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key === "symbol") {
        return err(jsonError("symbol-key", path, "JSON arrays cannot have symbol keys"));
      }
      if (key === "length") continue;
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
        return err(jsonError("invalid-object", `${path}.${key}`, "JSON arrays cannot have extra properties"));
      }
    }
    const output: JsonValue[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, index);
      if (descriptor === undefined) {
        return err(jsonError("invalid-object", `${path}[${index}]`, "Sparse arrays are not exact JSON values"));
      }
      if (descriptor.get !== undefined || descriptor.set !== undefined) {
        return err(jsonError("accessor-property", `${path}[${index}]`, "JSON arrays must use data elements"));
      }
      if (!descriptor.enumerable) {
        return err(jsonError("invalid-object", `${path}[${index}]`, "JSON array elements must be enumerable"));
      }
      const item = parseJsonAt(descriptor.value, `${path}[${index}]`, depth + 1, limits, budget, nextAncestors);
      if (!item.ok) {
        return item;
      }
      output.push(item.value);
    }
    return ok(output);
  }

  const prototype = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return err(jsonError("invalid-object", path, "JSON objects must have Object or null prototypes"));
  }

  const output = Object.create(null) as JsonObject;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key === "symbol") {
      return err(jsonError("symbol-key", path, "JSON objects cannot have symbol keys"));
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
      return err(jsonError("accessor-property", `${path}.${key}`, "JSON objects must use data properties"));
    }
    if (!descriptor.enumerable) {
      return err(jsonError("invalid-object", `${path}.${key}`, "JSON object properties must be enumerable"));
    }
    budget.stringBytes += utf8ByteLength(key);
    if (budget.stringBytes > limits.maxStringBytes) {
      return err(jsonError("string-limit-exceeded", `${path}.${key}`, `JSON strings exceed ${limits.maxStringBytes} UTF-8 bytes`));
    }
    const child = parseJsonAt(descriptor.value, `${path}.${key}`, depth + 1, limits, budget, nextAncestors);
    if (!child.ok) {
      return child;
    }
    output[key] = child.value;
  }
  return ok(output);
}

export function parseJsonValue(
  input: unknown,
  limits: JsonLimits = DEFAULT_JSON_LIMITS,
): Result<JsonValue, JsonBoundaryError> {
  if (
    !Number.isSafeInteger(limits.maxDepth)
    || limits.maxDepth < 0
    || !Number.isSafeInteger(limits.maxNodes)
    || limits.maxNodes < 1
    || !Number.isSafeInteger(limits.maxStringBytes)
    || limits.maxStringBytes < 0
  ) {
    throw new Error("JSON limits must be non-negative safe integers and allow at least one node");
  }
  try {
    return parseJsonAt(input, "$", 0, limits, { nodes: 0, stringBytes: 0 }, new Set());
  } catch (reason) {
    return err(jsonError(
      "invalid-object",
      "$",
      renderUnknownReason(reason, "JSON object inspection failed"),
    ));
  }
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`);
  return `{${entries.join(",")}}`;
}

export function canonicalJson(
  input: unknown,
  limits: JsonLimits = DEFAULT_JSON_LIMITS,
): Result<string, JsonBoundaryError> {
  const parsed = parseJsonValue(input, limits);
  return parsed.ok ? ok(canonicalize(parsed.value)) : parsed;
}

export function cloneJson(
  input: unknown,
  limits: JsonLimits = DEFAULT_JSON_LIMITS,
): Result<JsonValue, JsonBoundaryError> {
  const canonical = canonicalJson(input, limits);
  if (!canonical.ok) {
    return canonical;
  }
  return ok(JSON.parse(canonical.value) as JsonValue);
}

export function freezeJson<Value extends JsonValue>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      freezeJson(child);
    }
    Object.freeze(value);
  }
  return value;
}

export interface StableHash {
  readonly algorithm: "fnv1a-64";
  readonly value: string;
}

function updateFnvByte(hash: bigint, byte: number): bigint {
  return BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
}

export function stableHash(input: unknown): Result<StableHash, JsonBoundaryError> {
  const serialized = canonicalJson(input);
  if (!serialized.ok) {
    return serialized;
  }
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < serialized.value.length; index += 1) {
    const code = serialized.value.charCodeAt(index);
    if (code <= 0x7f) {
      hash = updateFnvByte(hash, code);
    } else if (code <= 0x7ff) {
      hash = updateFnvByte(hash, 0xc0 | (code >> 6));
      hash = updateFnvByte(hash, 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < serialized.value.length) {
      const next = serialized.value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        hash = updateFnvByte(hash, 0xf0 | (point >> 18));
        hash = updateFnvByte(hash, 0x80 | ((point >> 12) & 0x3f));
        hash = updateFnvByte(hash, 0x80 | ((point >> 6) & 0x3f));
        hash = updateFnvByte(hash, 0x80 | (point & 0x3f));
        index += 1;
      } else {
        hash = updateFnvByte(hash, 0xef);
        hash = updateFnvByte(hash, 0xbf);
        hash = updateFnvByte(hash, 0xbd);
      }
    } else {
      hash = updateFnvByte(hash, 0xe0 | (code >> 12));
      hash = updateFnvByte(hash, 0x80 | ((code >> 6) & 0x3f));
      hash = updateFnvByte(hash, 0x80 | (code & 0x3f));
    }
  }
  return ok({ algorithm: "fnv1a-64", value: hash.toString(16).padStart(16, "0") });
}

export type WorldParser<World extends JsonValue> = (input: unknown) => World;

export interface WorldParseError {
  readonly code: "invalid-world";
  readonly message: string;
}

export function parseAndCloneWorld<World extends JsonValue>(
  input: unknown,
  parseWorld: WorldParser<World>,
): Result<World, JsonBoundaryError | WorldParseError> {
  const cloned = cloneJson(input);
  if (!cloned.ok) {
    return cloned;
  }
  try {
    const world = parseWorld(cloned.value);
    const verified = cloneJson(world);
    if (!verified.ok) {
      return verified;
    }
    return ok(freezeJson(verified.value as World));
  } catch (reason) {
    return err({ code: "invalid-world", message: renderUnknownReason(reason) });
  }
}
