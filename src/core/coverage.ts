import { parseCoverageKey, parseScenarioId, type CoverageKey, type ScenarioId } from "./ids.js";
import { parseJsonValue } from "./json.js";
import type { JsonValue } from "./json-value.js";
import { err, isRecord, ok, type Result } from "./result.js";
import type { ScenarioCatalog } from "./scenario.js";

export const CARAPACE_COVERAGE_SCHEMA = "carapace.coverage/v1" as const;

export type CoverageMode = "fixture" | "mixed" | "direct";

export interface CoverageEntryInput<Route extends string> {
  readonly key: string;
  readonly mode: CoverageMode;
  readonly claim: string;
  readonly route: Route | null;
  readonly scenarios: readonly (ScenarioId | string)[];
}

export interface CoverageEntry<Route extends string> {
  readonly key: CoverageKey;
  readonly mode: CoverageMode;
  readonly claim: string;
  readonly route: Route | null;
  readonly scenarios: readonly ScenarioId[];
}

export type CoverageErrorCode =
  | "duplicate-coverage"
  | "duplicate-expected-key"
  | "invalid-claim"
  | "invalid-coverage"
  | "invalid-mode"
  | "invalid-route"
  | "invalid-scenario"
  | "missing-coverage"
  | "unexpected-coverage"
  | "unknown-coverage"
  | "unknown-scenario";

export interface CoverageError {
  readonly code: CoverageErrorCode;
  readonly message: string;
  readonly keys: readonly string[];
}

export interface CoverageCatalog<Route extends string> {
  readonly size: number;
  readonly keys: () => readonly CoverageKey[];
  readonly list: () => readonly CoverageEntry<Route>[];
  readonly get: (key: CoverageKey) => CoverageEntry<Route> | undefined;
  readonly resolve: (key: unknown) => Result<CoverageEntry<Route>, CoverageError>;
  readonly requireExactKeys: (expected: readonly (CoverageKey | string)[]) => Result<true, CoverageError>;
}

export interface CoverageCatalogSnapshot<Route extends string = string> {
  readonly schema: typeof CARAPACE_COVERAGE_SCHEMA;
  readonly entries: readonly CoverageEntry<Route>[];
}

export const EMPTY_COVERAGE_CATALOG_SNAPSHOT = Object.freeze({
  schema: CARAPACE_COVERAGE_SCHEMA,
  entries: Object.freeze([]),
}) satisfies CoverageCatalogSnapshot<string>;

function coverageError(code: CoverageErrorCode, message: string, keys: readonly string[] = []): CoverageError {
  return { code, message, keys };
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
      return true;
    }
  }
  return false;
}

const COVERAGE_ENTRY_KEYS = new Set(["key", "mode", "claim", "route", "scenarios"]);
const COVERAGE_SNAPSHOT_KEYS = new Set(["schema", "entries"]);

/** Create the exact versioned JSON snapshot published to verification tooling. */
export function createCoverageCatalogSnapshot<Route extends string>(
  catalog: CoverageCatalog<Route>,
): CoverageCatalogSnapshot<Route> {
  return Object.freeze({
    schema: CARAPACE_COVERAGE_SCHEMA,
    entries: catalog.list(),
  });
}

/** Parse an exact versioned coverage snapshot read from verification tooling. */
export function parseCoverageCatalogSnapshot(
  input: unknown,
): Result<CoverageCatalogSnapshot<string>, CoverageError> {
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !isRecord(parsed.value)) {
    return err(coverageError(
      "invalid-coverage",
      parsed.ok ? "Coverage snapshot must be an object" : parsed.error.message,
    ));
  }
  for (const key of Object.keys(parsed.value)) {
    if (!COVERAGE_SNAPSHOT_KEYS.has(key)) {
      return err(coverageError("invalid-coverage", `Unknown coverage snapshot key: ${key}`));
    }
  }
  if (parsed.value.schema !== CARAPACE_COVERAGE_SCHEMA) {
    return err(coverageError(
      "invalid-coverage",
      `Coverage snapshot schema must be ${CARAPACE_COVERAGE_SCHEMA}`,
    ));
  }
  if (!Array.isArray(parsed.value.entries)) {
    return err(coverageError("invalid-coverage", "Coverage snapshot entries must be an array"));
  }
  const entries: CoverageEntryInput<string>[] = [];
  for (const [index, candidate] of parsed.value.entries.entries()) {
    if (!isRecord(candidate)) {
      return err(coverageError("invalid-coverage", `Coverage entry ${String(index)} must be an object`));
    }
    for (const key of Object.keys(candidate)) {
      if (!COVERAGE_ENTRY_KEYS.has(key)) {
        return err(coverageError(
          "invalid-coverage",
          `Unknown coverage entry key at ${String(index)}: ${key}`,
        ));
      }
    }
    if (
      typeof candidate.key !== "string"
      || typeof candidate.claim !== "string"
      || (candidate.mode !== "fixture" && candidate.mode !== "mixed" && candidate.mode !== "direct")
      || (candidate.route !== null && typeof candidate.route !== "string")
      || !Array.isArray(candidate.scenarios)
      || !candidate.scenarios.every((scenario) => typeof scenario === "string")
    ) {
      return err(coverageError(
        "invalid-coverage",
        `Coverage entry ${String(index)} has an invalid wire shape`,
      ));
    }
    entries.push({
      key: candidate.key,
      mode: candidate.mode,
      claim: candidate.claim,
      route: candidate.route,
      scenarios: candidate.scenarios,
    });
  }
  const catalog = createCoverageCatalog<JsonValue, string>(entries);
  return catalog.ok ? ok(createCoverageCatalogSnapshot(catalog.value)) : catalog;
}

export function createCoverageCatalog<
  World extends JsonValue,
  Route extends string,
>(
  inputs: readonly CoverageEntryInput<Route>[],
  scenarios?: ScenarioCatalog<World, Route>,
): Result<CoverageCatalog<Route>, CoverageError> {
  const entries: CoverageEntry<Route>[] = [];
  const byKey = new Map<CoverageKey, CoverageEntry<Route>>();

  for (const input of inputs) {
    const key = parseCoverageKey(input.key);
    if (!key.ok) {
      return err(coverageError("invalid-coverage", key.error.message, [String(input.key)]));
    }
    if (byKey.has(key.value)) {
      return err(coverageError("duplicate-coverage", `Duplicate coverage key: ${key.value}`, [key.value]));
    }
    if (
      input.claim.trim().length === 0
      || input.claim.length > 1_000
      || hasControlCharacters(input.claim)
    ) {
      return err(coverageError("invalid-claim", `Coverage ${key.value} needs a 1-1000 character claim`, [key.value]));
    }
    if (input.mode !== "fixture" && input.mode !== "mixed" && input.mode !== "direct") {
      return err(coverageError("invalid-mode", `Coverage ${key.value} has an unknown proof mode`, [key.value]));
    }
    if (
      input.route !== null
      && (input.route.trim().length === 0 || input.route.length > 256)
    ) {
      return err(coverageError("invalid-route", `Coverage ${key.value} has an invalid route`, [key.value]));
    }
    if (input.mode === "direct" && input.scenarios.length > 0) {
      return err(coverageError("invalid-mode", `Direct coverage ${key.value} cannot cite fixture scenarios`, [key.value]));
    }
    if (input.mode !== "direct" && input.scenarios.length === 0) {
      return err(coverageError("invalid-mode", `${input.mode} coverage ${key.value} must cite at least one scenario`, [key.value]));
    }

    const scenarioIds: ScenarioId[] = [];
    const seenScenarios = new Set<ScenarioId>();
    for (const candidate of input.scenarios) {
      const id = parseScenarioId(candidate);
      if (!id.ok) {
        return err(coverageError("invalid-scenario", id.error.message, [String(candidate)]));
      }
      if (seenScenarios.has(id.value)) {
        return err(coverageError("invalid-scenario", `Coverage ${key.value} repeats scenario ${id.value}`, [id.value]));
      }
      if (scenarios !== undefined && scenarios.get(id.value) === undefined) {
        return err(coverageError("unknown-scenario", `Coverage ${key.value} cites unknown scenario ${id.value}`, [id.value]));
      }
      seenScenarios.add(id.value);
      scenarioIds.push(id.value);
    }

    const entry = Object.freeze({
      key: key.value,
      mode: input.mode,
      claim: input.claim,
      route: input.route,
      scenarios: Object.freeze(scenarioIds),
    });
    entries.push(entry);
    byKey.set(key.value, entry);
  }

  const frozenEntries = Object.freeze(entries);
  const keys = Object.freeze(frozenEntries.map((entry) => entry.key));
  const catalog: CoverageCatalog<Route> = {
    size: frozenEntries.length,
    keys: () => keys,
    list: () => frozenEntries,
    get: (key: CoverageKey) => byKey.get(key),
    resolve: (input: unknown) => {
      const key = parseCoverageKey(input);
      if (!key.ok) {
        return err(coverageError("invalid-coverage", key.error.message, [String(input)]));
      }
      const entry = byKey.get(key.value);
      return entry === undefined
        ? err(coverageError("unknown-coverage", `Unknown coverage key: ${key.value}`, [key.value]))
        : ok(entry);
    },
    requireExactKeys: (expected: readonly (CoverageKey | string)[]) => {
      const expectedKeys: CoverageKey[] = [];
      const seen = new Set<CoverageKey>();
      for (const candidate of expected) {
        const parsed = parseCoverageKey(candidate);
        if (!parsed.ok) {
          return err(coverageError("invalid-coverage", parsed.error.message, [String(candidate)]));
        }
        if (seen.has(parsed.value)) {
          return err(coverageError("duplicate-expected-key", `Expected coverage repeats ${parsed.value}`, [parsed.value]));
        }
        seen.add(parsed.value);
        expectedKeys.push(parsed.value);
      }
      const missing = expectedKeys.filter((key) => !byKey.has(key));
      if (missing.length > 0) {
        return err(coverageError("missing-coverage", `Missing coverage keys: ${missing.join(", ")}`, missing));
      }
      const unexpected = keys.filter((key) => !seen.has(key));
      if (unexpected.length > 0) {
        return err(coverageError("unexpected-coverage", `Unexpected coverage keys: ${unexpected.join(", ")}`, unexpected));
      }
      return ok<true>(true);
    },
  };
  return ok(Object.freeze(catalog));
}
