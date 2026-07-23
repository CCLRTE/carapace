import type { CoverageEntry, CoverageMode } from "../core/coverage.js";

export type CoverageEvidenceStatus =
  | "direct-required"
  | "fixture-verified"
  | "not-exercised"
  | "partial"
  | "verified";

export type CoverageEvidenceStatusFor<Mode extends CoverageMode> =
  Mode extends "direct"
    ? "direct-required" | "verified"
    : Mode extends "fixture"
      ? "not-exercised" | "partial" | "verified"
      : "fixture-verified" | "not-exercised" | "partial" | "verified";

export interface CoverageEvidenceFacts {
  /** Scenario IDs whose product-owned assertions passed in the current evidence set. */
  readonly exercisedScenarios: ReadonlySet<string>;
  /** Whether current direct evidence for the substituted production port passed. */
  readonly directEvidence?: "missing" | "verified";
}

/**
 * Classify claim evidence from its declared proof mode and current facts.
 * Scenario actions and assertions remain product-owned; this function owns only
 * the shared completion taxonomy.
 */
export function classifyCoverageEvidence<
  Entry extends CoverageEntry,
>(
  entry: Entry,
  facts: CoverageEvidenceFacts,
): CoverageEvidenceStatusFor<Entry["mode"]> {
  const directVerified = facts.directEvidence === "verified";
  if (entry.mode === "direct") {
    return (directVerified ? "verified" : "direct-required") as CoverageEvidenceStatusFor<
      Entry["mode"]
    >;
  }

  let exercised = 0;
  for (const scenario of entry.scenarios) {
    if (facts.exercisedScenarios.has(scenario)) exercised += 1;
  }
  if (exercised === 0) {
    return (directVerified && entry.mode === "mixed" ? "partial" : "not-exercised") as
      CoverageEvidenceStatusFor<Entry["mode"]>;
  }
  if (exercised < entry.scenarios.length) {
    return "partial" as CoverageEvidenceStatusFor<Entry["mode"]>;
  }
  if (entry.mode === "fixture") {
    return "verified" as CoverageEvidenceStatusFor<Entry["mode"]>;
  }
  return (directVerified ? "verified" : "fixture-verified") as CoverageEvidenceStatusFor<
    Entry["mode"]
  >;
}
