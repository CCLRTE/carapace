import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TODO_PRODUCTION_MARKERS = Object.freeze([
  "@cclrte/carapace",
  "carapace.fixture/v1",
  "carapace.runtime/v1",
  "carapace.probe/v1",
  "carapace.coverage/v1",
  "carapace.browser-bridge/v1",
  "__carapace_scenario",
  "__carapace_fixture",
  "__carapace",
  "carapace/main",
  "Todo Carapace",
]);

export interface ProductionBoundaryViolation {
  readonly file: string;
  readonly markers: readonly string[];
}

export interface ProductionBoundaryResult {
  readonly scanned: readonly string[];
  readonly violations: readonly ProductionBoundaryViolation[];
}

async function* walk(directory: string): AsyncGenerator<string> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

export async function scanTodoProductionOutput(
  directory: string,
  markers: readonly string[] = TODO_PRODUCTION_MARKERS,
): Promise<ProductionBoundaryResult> {
  if (markers.length === 0 || markers.some((marker) => marker.length === 0)) {
    throw new Error("Production boundary markers must contain non-empty values.");
  }
  const scanned: string[] = [];
  const violations: ProductionBoundaryViolation[] = [];
  for await (const file of walk(resolve(directory))) {
    scanned.push(file);
    const bytes = await readFile(file);
    const found = markers.filter((marker) => bytes.includes(Buffer.from(marker)));
    if (found.length > 0) violations.push(Object.freeze({ file, markers: Object.freeze(found) }));
  }
  if (scanned.length === 0) throw new Error("Production boundary did not scan any emitted files.");
  return Object.freeze({
    scanned: Object.freeze(scanned),
    violations: Object.freeze(violations),
  });
}

if (import.meta.main) {
  const ownDirectory = dirname(fileURLToPath(import.meta.url));
  const directory = process.argv[2] ?? resolve(ownDirectory, "../dist");
  const result = await scanTodoProductionOutput(directory);
  if (result.violations.length > 0) {
    throw new Error([
      "Todo production output contains Carapace markers:",
      ...result.violations.map((violation) => `${violation.file}: ${violation.markers.join(", ")}`),
    ].join("\n"));
  }
  console.log(`Todo production boundary passed (${String(result.scanned.length)} files).`);
}
