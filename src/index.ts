import {
  defineCarapace,
  parseCarapaceDefinition,
  tryDefineCarapace,
} from "./core/definition.js";

export const FIXTURE_QUERY_KEY = "__carapace_fixture" as const;
export const SCENARIO_QUERY_KEY = "__carapace_scenario" as const;

export {
  defineCarapace,
  parseCarapaceDefinition,
  tryDefineCarapace,
};
export type {
  CarapaceDefinition,
  CarapaceDefinitionError,
  CarapaceDefinitionInput,
  CarapaceDefinitionLimits,
} from "./core/definition.js";
export type {
  CoverageCatalogSnapshot,
  CoverageEntry,
  CoverageEntryInput,
  CoverageMode,
} from "./core/coverage.js";
export type {
  FixtureCreateInput,
  FixtureEnvelope,
  FixtureError,
} from "./core/fixture.js";
export type { WorldParser } from "./core/json.js";
export type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from "./core/json-value.js";
export type {
  ActiveCarapace,
  CarapaceActivation,
  QueryError,
} from "./core/query.js";
export type {
  LogicalRuntime,
  LogicalRuntimeSnapshot,
} from "./core/runtime.js";
export type {
  ScenarioDefinition,
  ScenarioDefinitionInput,
} from "./core/scenario.js";
