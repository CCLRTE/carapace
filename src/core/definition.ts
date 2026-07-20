import {
  createCoverageCatalog,
  type CoverageCatalog,
  type CoverageEntryInput,
  type CoverageError,
} from "./coverage.js";
import {
  DEFAULT_MAX_FIXTURE_BYTES,
  createFixtureEnvelope,
  parseFixtureEnvelope,
  parseFixtureJson,
  serializeFixtureJson,
  type FixtureCreateInput,
  type FixtureEnvelope,
  type FixtureError,
} from "./fixture.js";
import type { ScenarioId } from "./ids.js";
import type { WorldParser } from "./json.js";
import type { JsonValue } from "./json-value.js";
import {
  DEFAULT_MAX_QUERY_BYTES,
  activateCarapaceScenario,
  parseCarapaceQuery,
  type ActiveCarapace,
  type QueryError,
} from "./query.js";
import { err, ok, type Result } from "./result.js";
import {
  createScenarioCatalog,
  type ScenarioCatalog,
  type ScenarioCatalogError,
  type ScenarioDefinition,
  type ScenarioDefinitionInput,
} from "./scenario.js";

export interface CarapaceDefinitionInput<World extends JsonValue, Route extends string> {
  readonly parseWorld: WorldParser<World>;
  readonly defaultScenario: ScenarioId | string;
  readonly scenarios: readonly ScenarioDefinitionInput<World, Route>[];
  readonly coverage: readonly CoverageEntryInput<Route>[];
  readonly maxFixtureBytes?: number;
  readonly maxQueryBytes?: number;
}

export type CarapaceDefinitionError =
  | {
    readonly code: "invalid-scenarios";
    readonly message: string;
    readonly scenarioError: ScenarioCatalogError;
    readonly coverageError: null;
  }
  | {
    readonly code: "invalid-default-scenario";
    readonly message: string;
    readonly scenarioError: ScenarioCatalogError;
    readonly coverageError: null;
  }
  | {
    readonly code: "invalid-coverage";
    readonly message: string;
    readonly scenarioError: null;
    readonly coverageError: CoverageError;
  }
  | {
    readonly code: "invalid-limits";
    readonly message: string;
    readonly scenarioError: null;
    readonly coverageError: null;
  };

export interface CarapaceDefinitionLimits {
  readonly maxFixtureBytes: number;
  readonly maxQueryBytes: number;
}

export interface CarapaceDefinition<World extends JsonValue, Route extends string> {
  readonly defaultScenario: ScenarioDefinition<World, Route>;
  readonly scenarios: ScenarioCatalog<World, Route>;
  readonly coverage: CoverageCatalog<Route>;
  readonly parseWorld: WorldParser<World>;
  readonly limits: CarapaceDefinitionLimits;
  /** Parse a foreign query. An empty query activates the validated default scenario. */
  readonly activate: (source: string) => Result<ActiveCarapace<World, Route>, QueryError>;
  /** Activate a named catalog scenario without going through a browser URL. */
  readonly activateScenario: (scenario: unknown) => Result<ActiveCarapace<World, Route>, QueryError>;
  /** Parse a foreign fixture under this definition's catalog, parser, and byte limit. */
  readonly parseFixture: (input: unknown) => Result<FixtureEnvelope<World, Route>, FixtureError>;
  /** Parse fixture JSON under this definition's catalog, parser, and byte limit. */
  readonly parseFixtureJson: (source: string) => Result<FixtureEnvelope<World, Route>, FixtureError>;
  /** Create a fixture under this definition's catalog, parser, and byte limit. */
  readonly createFixture: (
    input: FixtureCreateInput<World>,
  ) => Result<FixtureEnvelope<World, Route>, FixtureError>;
  /** Serialize a fixture that this definition can activate. */
  readonly serializeFixture: (input: FixtureCreateInput<World>) => Result<string, FixtureError>;
}

function definitionError(
  code: CarapaceDefinitionError["code"],
  message: string,
  causes: {
    readonly scenarioError?: ScenarioCatalogError;
    readonly coverageError?: CoverageError;
  } = {},
): CarapaceDefinitionError {
  if (code === "invalid-scenarios" || code === "invalid-default-scenario") {
    const scenarioError = causes.scenarioError;
    if (scenarioError === undefined) throw new Error(`${code} requires a scenario error`);
    return Object.freeze({ code, message, scenarioError, coverageError: null });
  }
  if (code === "invalid-coverage") {
    const coverageError = causes.coverageError;
    if (coverageError === undefined) throw new Error("invalid-coverage requires a coverage error");
    return Object.freeze({ code, message, scenarioError: null, coverageError });
  }
  return Object.freeze({ code, message, scenarioError: null, coverageError: null });
}

function validPositiveLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function activeFromParsed<World extends JsonValue, Route extends string>(
  parsed: ReturnType<typeof parseCarapaceQuery<World, Route>>,
): Result<ActiveCarapace<World, Route>, QueryError> {
  if (!parsed.ok) return parsed;
  if (parsed.value.kind === "active") return ok(parsed.value);
  return err({ code: "invalid-scenario", message: "Carapace activation did not select a scenario" });
}

/**
 * Validate the product-owned world parser, scenarios, default activation, and
 * proof catalog once, then expose one fail-closed activation boundary.
 */
export function defineCarapace<World extends JsonValue, Route extends string>(
  input: CarapaceDefinitionInput<World, Route>,
): Result<CarapaceDefinition<World, Route>, CarapaceDefinitionError> {
  const maxFixtureBytes = input.maxFixtureBytes ?? DEFAULT_MAX_FIXTURE_BYTES;
  const maxQueryBytes = input.maxQueryBytes ?? DEFAULT_MAX_QUERY_BYTES;
  if (!validPositiveLimit(maxFixtureBytes) || !validPositiveLimit(maxQueryBytes)) {
    return err(definitionError(
      "invalid-limits",
      "Carapace query and fixture limits must be positive safe integers",
    ));
  }

  const scenarios = createScenarioCatalog(input.scenarios, input.parseWorld);
  if (!scenarios.ok) {
    return err(definitionError("invalid-scenarios", scenarios.error.message, {
      scenarioError: scenarios.error,
    }));
  }
  const defaultScenario = scenarios.value.resolve(input.defaultScenario);
  if (!defaultScenario.ok) {
    return err(definitionError("invalid-default-scenario", defaultScenario.error.message, {
      scenarioError: defaultScenario.error,
    }));
  }
  const coverage = createCoverageCatalog(input.coverage, scenarios.value);
  if (!coverage.ok) {
    return err(definitionError("invalid-coverage", coverage.error.message, {
      coverageError: coverage.error,
    }));
  }

  const limits = Object.freeze({ maxFixtureBytes, maxQueryBytes });
  const fixtureOptions = Object.freeze({
    scenarios: scenarios.value,
    parseWorld: input.parseWorld,
    maxBytes: maxFixtureBytes,
  });
  const queryOptions = Object.freeze({
    ...fixtureOptions,
    maxQueryBytes,
  });
  const activateScenario = (
    scenario: unknown,
  ): Result<ActiveCarapace<World, Route>, QueryError> => activateCarapaceScenario(
    scenario,
    scenarios.value,
  );
  const activate = (source: string): Result<ActiveCarapace<World, Route>, QueryError> => {
    const parsed = parseCarapaceQuery(source, queryOptions);
    if (!parsed.ok || parsed.value.kind === "active") return activeFromParsed(parsed);
    return activateScenario(defaultScenario.value.id);
  };

  return ok(Object.freeze({
    defaultScenario: defaultScenario.value,
    scenarios: scenarios.value,
    coverage: coverage.value,
    parseWorld: input.parseWorld,
    limits,
    activate,
    activateScenario,
    parseFixture: (fixture: unknown) => parseFixtureEnvelope(fixture, fixtureOptions),
    parseFixtureJson: (source: string) => parseFixtureJson(source, fixtureOptions),
    createFixture: (fixture: FixtureCreateInput<World>) => createFixtureEnvelope(fixture, fixtureOptions),
    serializeFixture: (fixture: FixtureCreateInput<World>) => serializeFixtureJson(fixture, fixtureOptions),
  }));
}
