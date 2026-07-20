import { cloneJson, freezeJson } from "../core/json.js";
import type { JsonValue } from "../core/json-value.js";
import { renderUnknownReason } from "../core/reason.js";
import { err, ok, type Result } from "../core/result.js";
import {
  EMPTY_COVERAGE_CATALOG_SNAPSHOT,
  parseCoverageCatalogSnapshot,
  type CoverageCatalogSnapshot,
} from "../core/coverage.js";
import type { CarapaceProbe, CarapaceProbeSnapshot } from "../testing/probe.js";

export const CARAPACE_BROWSER_BRIDGE_SCHEMA = "carapace.browser-bridge/v1" as const;

export interface CarapaceBrowserBridge {
  readonly schema: typeof CARAPACE_BROWSER_BRIDGE_SCHEMA;
  readonly snapshot: () => CarapaceProbeSnapshot;
  readonly reset: () => void;
  readonly coverage: CoverageCatalogSnapshot;
}

export interface CarapaceBrowserBridgeOptions {
  readonly probe: Pick<CarapaceProbe, "snapshot">;
  readonly coverage?: unknown;
  readonly reset?: () => void;
  /** Preserve a product's legacy flat activity shape while migrating automation. */
  readonly legacyActivitySnapshot?: (snapshot: CarapaceProbeSnapshot) => unknown;
  readonly target?: object;
}

export type CarapaceBrowserBridgeErrorCode = "install-failed" | "invalid-coverage";

export interface CarapaceBrowserBridgeError {
  readonly code: CarapaceBrowserBridgeErrorCode;
  readonly message: string;
}

export type CarapaceBrowserBridgeUninstall = () => void;

const BRIDGE_KEYS = [
  "__carapace",
  "__carapaceActivitySnapshot",
  "__carapaceReset",
  "__carapaceCoverage",
] as const;

interface ActiveBridgeInstallation {
  readonly target: object;
  readonly installed: ReadonlyMap<string, unknown>;
  readonly restore: ReadonlyMap<string, PropertyDescriptor | undefined>;
  readonly deactivate: () => void;
  readonly uninstall: CarapaceBrowserBridgeUninstall;
}

let activeBridgeInstallation: ActiveBridgeInstallation | null = null;

function bridgeError(
  code: CarapaceBrowserBridgeErrorCode,
  message: string,
): CarapaceBrowserBridgeError {
  return Object.freeze({ code, message });
}

function defaultReset(): void {
  const target = globalThis as typeof globalThis & { readonly location?: { readonly reload?: () => void } };
  target.location?.reload?.();
}

function restoreDescriptor(target: object, key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, key);
  } else {
    Object.defineProperty(target, key, descriptor);
  }
}

function restoreInstalledValue(
  target: object,
  key: string,
  installedValue: unknown,
  previous: PropertyDescriptor | undefined,
): void {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor?.value === installedValue) restoreDescriptor(target, key, previous);
  } catch {
    // Uninstall and failed-install cleanup are best effort on a hostile target.
  }
}

/**
 * Install one process-local browser automation bridge. A later installation
 * restores and replaces the earlier one; stale uninstall handles are harmless.
 */
export function installCarapaceBrowserBridge(
  options: CarapaceBrowserBridgeOptions,
): Result<CarapaceBrowserBridgeUninstall, CarapaceBrowserBridgeError> {
  let coverageInput: unknown;
  try {
    coverageInput = options.coverage === undefined
      ? EMPTY_COVERAGE_CATALOG_SNAPSHOT
      : options.coverage;
  } catch (reason) {
    return err(bridgeError("invalid-coverage", renderUnknownReason(reason, "Failed to read Carapace coverage")));
  }
  const parsedCoverage = parseCoverageCatalogSnapshot(coverageInput);
  if (!parsedCoverage.ok) {
    return err(bridgeError("invalid-coverage", parsedCoverage.error.message));
  }
  const coverage = parsedCoverage.value;

  let target: object;
  let reset: () => void;
  let probe: Pick<CarapaceProbe, "snapshot">;
  let legacyActivitySnapshot: ((snapshot: CarapaceProbeSnapshot) => unknown) | undefined;
  try {
    target = options.target ?? globalThis;
    reset = options.reset ?? defaultReset;
    probe = options.probe;
    legacyActivitySnapshot = options.legacyActivitySnapshot;
  } catch (reason) {
    return err(bridgeError(
      "install-failed",
      renderUnknownReason(reason, "Failed to read Carapace browser bridge options"),
    ));
  }
  const previousInstallation = activeBridgeInstallation;
  const rollback = new Map<string, PropertyDescriptor | undefined>();
  const restore = new Map<string, PropertyDescriptor | undefined>();
  try {
    for (const key of BRIDGE_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      rollback.set(key, descriptor);
      const previousOwnsValue = previousInstallation?.target === target
        && descriptor?.value === previousInstallation.installed.get(key);
      restore.set(
        key,
        previousOwnsValue ? previousInstallation.restore.get(key) : descriptor,
      );
    }
  } catch (reason) {
    return err(bridgeError(
      "install-failed",
      renderUnknownReason(reason, "Failed to inspect the Carapace browser bridge target"),
    ));
  }

  const readSnapshot = (): CarapaceProbeSnapshot => {
    try {
      const snapshot = probe.snapshot();
      if (!snapshot.ok) throw new Error(renderUnknownReason(snapshot.error));
      return snapshot.value;
    } catch (reason) {
      throw new Error(`Carapace probe failed: ${renderUnknownReason(reason)}`);
    }
  };
  const readLegacySnapshot = (): JsonValue => {
    const canonical = readSnapshot();
    let candidate: unknown;
    try {
      candidate = legacyActivitySnapshot === undefined ? canonical : legacyActivitySnapshot(canonical);
    } catch (reason) {
      throw new Error(`Carapace legacy snapshot failed: ${renderUnknownReason(reason)}`);
    }
    const cloned = cloneJson(candidate);
    if (!cloned.ok) throw new Error(`Carapace legacy snapshot is not JSON-safe: ${cloned.error.message}`);
    return freezeJson(cloned.value);
  };
  const bridge: CarapaceBrowserBridge = Object.freeze({
    schema: CARAPACE_BROWSER_BRIDGE_SCHEMA,
    snapshot: readSnapshot,
    reset,
    coverage,
  });
  const installed = new Map<string, unknown>([
    ["__carapace", bridge],
    ["__carapaceActivitySnapshot", readLegacySnapshot],
    ["__carapaceReset", reset],
    ["__carapaceCoverage", coverage],
  ]);

  try {
    for (const [key, value] of installed) {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value,
      });
    }
  } catch (reason) {
    for (const key of BRIDGE_KEYS) {
      restoreInstalledValue(target, key, installed.get(key), rollback.get(key));
    }
    return err(bridgeError(
      "install-failed",
      renderUnknownReason(reason, "Carapace browser bridge installation failed"),
    ));
  }

  let active = true;
  const installation: ActiveBridgeInstallation = Object.freeze({
    target,
    installed,
    restore,
    deactivate: (): void => {
      if (!active) return;
      active = false;
      if (activeBridgeInstallation === installation) activeBridgeInstallation = null;
    },
    uninstall: (): void => {
      if (!active) return;
      active = false;
      for (const key of BRIDGE_KEYS) {
        restoreInstalledValue(target, key, installed.get(key), restore.get(key));
      }
      if (activeBridgeInstallation === installation) activeBridgeInstallation = null;
    },
  });

  if (previousInstallation !== null) {
    if (previousInstallation.target === target) previousInstallation.deactivate();
    else previousInstallation.uninstall();
  }
  activeBridgeInstallation = installation;
  return ok(installation.uninstall);
}
