import { err, ok, type Result } from "./result.js";

declare const scenarioIdBrand: unique symbol;
declare const operationIdBrand: unique symbol;
declare const coverageKeyBrand: unique symbol;

export type ScenarioId = string & { readonly [scenarioIdBrand]: "ScenarioId" };
export type OperationId = string & { readonly [operationIdBrand]: "OperationId" };
export type CoverageKey = string & { readonly [coverageKeyBrand]: "CoverageKey" };

export type IdentifierKind = "scenario" | "operation" | "coverage";

export interface IdentifierError {
  readonly code: "invalid-identifier";
  readonly kind: IdentifierKind;
  readonly value: unknown;
  readonly message: string;
}

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._/-][a-z0-9]+)*$/u;
const MAX_IDENTIFIER_LENGTH = 120;

function parseIdentifier(input: unknown, kind: IdentifierKind): Result<string, IdentifierError> {
  if (
    typeof input !== "string"
    || input.length === 0
    || input.length > MAX_IDENTIFIER_LENGTH
    || !IDENTIFIER_PATTERN.test(input)
  ) {
    return err({
      code: "invalid-identifier",
      kind,
      value: input,
      message: `${kind} identifiers must be 1-${MAX_IDENTIFIER_LENGTH} lowercase ASCII characters with separated alphanumeric segments`,
    });
  }
  return ok(input);
}

export function parseScenarioId(input: unknown): Result<ScenarioId, IdentifierError> {
  const parsed = parseIdentifier(input, "scenario");
  return parsed.ok ? ok(parsed.value as ScenarioId) : parsed;
}

export function parseOperationId(input: unknown): Result<OperationId, IdentifierError> {
  const parsed = parseIdentifier(input, "operation");
  return parsed.ok ? ok(parsed.value as OperationId) : parsed;
}

export function parseCoverageKey(input: unknown): Result<CoverageKey, IdentifierError> {
  const parsed = parseIdentifier(input, "coverage");
  return parsed.ok ? ok(parsed.value as CoverageKey) : parsed;
}

export function scenarioId(input: string): ScenarioId {
  const parsed = parseScenarioId(input);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

export function operationId(input: string): OperationId {
  const parsed = parseOperationId(input);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

export function coverageKey(input: string): CoverageKey {
  const parsed = parseCoverageKey(input);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}
