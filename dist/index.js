import {
  DEFAULT_MAX_FIXTURE_BYTES,
  DEFAULT_MAX_QUERY_BYTES,
  activateCarapaceScenario,
  createFixtureEnvelope,
  createScenarioCatalog,
  maximumFixtureQueryBytes,
  parseCarapaceQuery,
  parseFixtureEnvelope,
  parseFixtureJson,
  serializeFixtureJson
} from "./index-tvvxm1nf.js";
import {
  parseLogicalRuntimeSnapshot
} from "./index-2mb8zsze.js";
import {
  CARAPACE_COVERAGE_SCHEMA,
  createCoverageCatalog,
  err,
  isRecord,
  ok,
  parseCoverageCatalogSnapshot,
  parseJsonValue,
  renderUnknownReason
} from "./index-xpkabpf3.js";

// src/core/definition.ts
function definitionError(code, message, causes = {}) {
  if (code === "invalid-scenarios" || code === "invalid-default-scenario") {
    const scenarioError = causes.scenarioError;
    if (scenarioError === undefined)
      throw new Error(`${code} requires a scenario error`);
    return Object.freeze({ code, message, scenarioError, coverageError: null });
  }
  if (code === "invalid-coverage") {
    const coverageError = causes.coverageError;
    if (coverageError === undefined)
      throw new Error("invalid-coverage requires a coverage error");
    return Object.freeze({ code, message, scenarioError: null, coverageError });
  }
  return Object.freeze({ code, message, scenarioError: null, coverageError: null });
}
function validPositiveLimit(value) {
  return Number.isSafeInteger(value) && value >= 1;
}
function activeFromParsed(parsed) {
  if (!parsed.ok)
    return parsed;
  if (parsed.value.kind === "active")
    return ok(parsed.value);
  return err({ code: "invalid-scenario", message: "Carapace activation did not select a scenario" });
}
function tryDefineCarapaceUnchecked(input) {
  const parseWorld = input.parseWorld;
  const defaultScenarioInput = input.defaultScenario;
  const scenarioInputs = input.scenarios;
  const coverageInputs = input.coverage;
  const maxFixtureBytes = input.maxFixtureBytes ?? DEFAULT_MAX_FIXTURE_BYTES;
  const maxQueryBytes = input.maxQueryBytes ?? DEFAULT_MAX_QUERY_BYTES;
  if (!validPositiveLimit(maxFixtureBytes) || !validPositiveLimit(maxQueryBytes)) {
    return err(definitionError("invalid-limits", "Carapace query and fixture limits must be positive safe integers"));
  }
  const requiredQueryBytes = maximumFixtureQueryBytes(maxFixtureBytes);
  if (!Number.isSafeInteger(requiredQueryBytes) || maxQueryBytes < requiredQueryBytes) {
    return err(definitionError("invalid-limits", `Carapace maxQueryBytes must be at least ${String(requiredQueryBytes)} to carry every bounded fixture`));
  }
  const scenarios = createScenarioCatalog(scenarioInputs, parseWorld);
  if (!scenarios.ok) {
    return err(definitionError("invalid-scenarios", scenarios.error.message, {
      scenarioError: scenarios.error
    }));
  }
  const defaultScenario = scenarios.value.resolve(defaultScenarioInput);
  if (!defaultScenario.ok) {
    return err(definitionError("invalid-default-scenario", defaultScenario.error.message, {
      scenarioError: defaultScenario.error
    }));
  }
  const coverage = createCoverageCatalog(coverageInputs, scenarios.value);
  if (!coverage.ok) {
    return err(definitionError("invalid-coverage", coverage.error.message, {
      coverageError: coverage.error
    }));
  }
  const limits = Object.freeze({ maxFixtureBytes, maxQueryBytes });
  const fixtureOptions = Object.freeze({
    scenarios: scenarios.value,
    parseWorld,
    maxBytes: maxFixtureBytes
  });
  const queryOptions = Object.freeze({
    ...fixtureOptions,
    maxQueryBytes
  });
  const activateScenario = (scenario) => activateCarapaceScenario(scenario, scenarios.value);
  const activate = (source) => {
    const parsed = parseCarapaceQuery(source, queryOptions);
    if (!parsed.ok || parsed.value.kind === "active")
      return activeFromParsed(parsed);
    return activateScenario(defaultScenario.value.id);
  };
  return ok(Object.freeze({
    defaultScenario: defaultScenario.value,
    scenarios: scenarios.value,
    coverage: coverage.value,
    parseWorld,
    limits,
    activate,
    activateScenario,
    parseFixture: (fixture) => parseFixtureEnvelope(fixture, fixtureOptions),
    parseFixtureJson: (source) => parseFixtureJson(source, fixtureOptions),
    createFixture: (fixture) => createFixtureEnvelope(fixture, fixtureOptions),
    serializeFixture: (fixture) => serializeFixtureJson(fixture, fixtureOptions)
  }));
}
function tryDefineCarapace(input) {
  try {
    return tryDefineCarapaceUnchecked(input);
  } catch (reason) {
    return err(definitionError("invalid-options", renderUnknownReason(reason, "Carapace definition options could not be inspected")));
  }
}
var DEFINITION_INPUT_KEYS = new Set([
  "coverage",
  "defaultScenario",
  "maxFixtureBytes",
  "maxQueryBytes",
  "parseWorld",
  "scenarios"
]);
var SCENARIO_INPUT_KEYS = new Set([
  "description",
  "id",
  "route",
  "runtime",
  "title",
  "world"
]);
function parseCarapaceDefinition(input) {
  try {
    if (!isRecord(input))
      throw new Error("Carapace definition must be an object");
    for (const key of Object.keys(input)) {
      if (!DEFINITION_INPUT_KEYS.has(key))
        throw new Error(`Unknown Carapace definition key: ${key}`);
    }
    const rawParser = input.parseWorld;
    if (typeof rawParser !== "function")
      throw new Error("Carapace parseWorld must be a function");
    const parseWorld = (candidate) => {
      const parsedCandidate = Reflect.apply(rawParser, undefined, [candidate]);
      const parsedJson = parseJsonValue(parsedCandidate);
      if (!parsedJson.ok)
        throw new Error(parsedJson.error.message);
      return parsedJson.value;
    };
    if (typeof input.defaultScenario !== "string") {
      throw new Error("Carapace defaultScenario must be a string");
    }
    if (!Array.isArray(input.scenarios))
      throw new Error("Carapace scenarios must be an array");
    const scenarios = [];
    for (const [index, candidate] of input.scenarios.entries()) {
      if (!isRecord(candidate))
        throw new Error(`Carapace scenario ${String(index)} must be an object`);
      for (const key of Object.keys(candidate)) {
        if (!SCENARIO_INPUT_KEYS.has(key)) {
          throw new Error(`Unknown Carapace scenario key at ${String(index)}: ${key}`);
        }
      }
      if (typeof candidate.id !== "string" || typeof candidate.title !== "string" || typeof candidate.route !== "string" || candidate.description !== undefined && typeof candidate.description !== "string") {
        throw new Error(`Carapace scenario ${String(index)} has an invalid shape`);
      }
      const world = parseJsonValue(candidate.world);
      if (!world.ok)
        throw new Error(`Carapace scenario ${String(index)} world is invalid: ${world.error.message}`);
      const runtime = candidate.runtime === undefined ? undefined : parseLogicalRuntimeSnapshot(candidate.runtime);
      if (runtime !== undefined && !runtime.ok) {
        throw new Error(`Carapace scenario ${String(index)} runtime is invalid: ${runtime.error.message}`);
      }
      scenarios.push({
        id: candidate.id,
        title: candidate.title,
        ...candidate.description === undefined ? {} : { description: candidate.description },
        route: candidate.route,
        world: world.value,
        ...runtime === undefined ? {} : { runtime: runtime.value }
      });
    }
    const coverage = parseCoverageCatalogSnapshot({
      schema: CARAPACE_COVERAGE_SCHEMA,
      entries: input.coverage
    });
    if (!coverage.ok) {
      return err(definitionError("invalid-coverage", coverage.error.message, {
        coverageError: coverage.error
      }));
    }
    const maxFixtureBytes = input.maxFixtureBytes;
    const maxQueryBytes = input.maxQueryBytes;
    if (maxFixtureBytes !== undefined && typeof maxFixtureBytes !== "number") {
      throw new Error("Carapace maxFixtureBytes must be a number");
    }
    if (maxQueryBytes !== undefined && typeof maxQueryBytes !== "number") {
      throw new Error("Carapace maxQueryBytes must be a number");
    }
    return tryDefineCarapaceUnchecked({
      parseWorld,
      defaultScenario: input.defaultScenario,
      scenarios,
      coverage: coverage.value.entries,
      ...maxFixtureBytes === undefined ? {} : { maxFixtureBytes },
      ...maxQueryBytes === undefined ? {} : { maxQueryBytes }
    });
  } catch (reason) {
    return err(definitionError("invalid-options", renderUnknownReason(reason, "Carapace definition options could not be inspected")));
  }
}
function defineCarapace(input) {
  const defined = tryDefineCarapace(input);
  if (!defined.ok) {
    throw new Error(defined.error.message, { cause: defined.error });
  }
  return defined.value;
}

// src/index.ts
var FIXTURE_QUERY_KEY = "__carapace_fixture";
var SCENARIO_QUERY_KEY = "__carapace_scenario";
export {
  tryDefineCarapace,
  parseCarapaceDefinition,
  defineCarapace,
  SCENARIO_QUERY_KEY,
  FIXTURE_QUERY_KEY
};
