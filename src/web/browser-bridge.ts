import { renderUnknownReason } from "../core/reason.js";
import { err, ok, type Result } from "../core/result.js";
import {
  EMPTY_COVERAGE_CATALOG_SNAPSHOT,
  parseCoverageCatalogSnapshot,
  type CoverageCatalogSnapshot,
} from "../core/coverage.js";
import {
  parseCarapaceProbeSnapshot,
  type CarapaceProbe,
  type CarapaceProbeSnapshot,
} from "../testing/probe.js";

export const CARAPACE_BROWSER_BRIDGE_SCHEMA = "carapace.browser-bridge/v1" as const;

export interface CarapaceBrowserBridge {
  readonly schema: typeof CARAPACE_BROWSER_BRIDGE_SCHEMA;
  readonly snapshot: () => CarapaceProbeSnapshot;
  readonly reset: () => undefined;
  readonly coverage: CoverageCatalogSnapshot;
}

export interface CarapaceBrowserBridgeOptions {
  readonly probe: Pick<CarapaceProbe, "snapshot">;
  readonly coverage?: unknown;
  readonly reset?: () => undefined;
  readonly target?: object;
}

export type CarapaceBrowserBridgeErrorCode = "install-failed" | "invalid-coverage";

export interface CarapaceBrowserBridgeError {
  readonly code: CarapaceBrowserBridgeErrorCode;
  readonly message: string;
}

export type CarapaceBrowserBridgeUninstall = () => undefined;

export interface PreparedCarapaceBrowserBridgeInstallation {
  /** Make this provisional replacement the process owner. Cannot fail. */
  readonly commit: () => undefined;
  /** Restore the exact owner observed before preparation. */
  readonly rollback: () => undefined;
  /** Remove a committed replacement and restore its underlying owner. */
  readonly uninstall: CarapaceBrowserBridgeUninstall;
}

const BRIDGE_KEYS = ["__carapace"] as const;

interface ActiveBridgeInstallation {
  readonly target: object;
  readonly installed: ReadonlyMap<string, unknown>;
  readonly restore: ReadonlyMap<string, PropertyDescriptor | undefined>;
  readonly deactivate: () => undefined;
  readonly uninstall: CarapaceBrowserBridgeUninstall;
}

let activeBridgeInstallation: ActiveBridgeInstallation | null = null;

function bridgeError(
  code: CarapaceBrowserBridgeErrorCode,
  message: string,
): CarapaceBrowserBridgeError {
  return Object.freeze({ code, message });
}

/** Consume a foreign thenable so a callback that lied about being synchronous cannot reject globally. */
function containPromiseLike(value: unknown): boolean {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") return false;
  let then: unknown;
  try {
    then = Reflect.get(value, "then");
  } catch {
    return false;
  }
  if (typeof then !== "function") return false;
  try {
    void Promise.resolve(value).catch(() => undefined);
  } catch {
    // Promise assimilation is a foreign boundary too. The callback remains contained.
  }
  return true;
}

function requireSynchronousResetResult(value: unknown): undefined {
  containPromiseLike(value);
  if (value !== undefined) {
    throw new Error("Carapace reset must complete synchronously and return undefined");
  }
  return undefined;
}

function defaultReset(): undefined {
  const target = globalThis as typeof globalThis & {
    readonly location?: { readonly reload?: () => unknown };
  };
  return requireSynchronousResetResult(target.location?.reload?.());
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

/** Prepare a reversible bridge replacement without deactivating the current owner. */
export function prepareCarapaceBrowserBridgeInstallation(
  options: CarapaceBrowserBridgeOptions,
): Result<PreparedCarapaceBrowserBridgeInstallation, CarapaceBrowserBridgeError> {
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
  let reset: () => undefined;
  let probe: Pick<CarapaceProbe, "snapshot">;
  try {
    target = options.target ?? globalThis;
    reset = options.reset ?? defaultReset;
    probe = options.probe;
  } catch (reason) {
    return err(bridgeError(
      "install-failed",
      renderUnknownReason(reason, "Failed to read Carapace browser bridge options"),
    ));
  }
  const previousInstallation = activeBridgeInstallation;
  const rollbackDescriptors = new Map<string, PropertyDescriptor | undefined>();
  const restore = new Map<string, PropertyDescriptor | undefined>();
  try {
    for (const key of BRIDGE_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      rollbackDescriptors.set(key, descriptor);
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
      const snapshot: unknown = probe.snapshot();
      if (containPromiseLike(snapshot)) {
        throw new Error("Carapace probe snapshots must complete synchronously");
      }
      if ((typeof snapshot !== "object" || snapshot === null) && typeof snapshot !== "function") {
        throw new Error("Carapace probe returned an invalid result");
      }
      const succeeded: unknown = Reflect.get(snapshot, "ok");
      if (succeeded !== true) {
        if (succeeded === false) throw new Error(renderUnknownReason(Reflect.get(snapshot, "error")));
        throw new Error("Carapace probe returned an invalid result");
      }
      const parsed = parseCarapaceProbeSnapshot(Reflect.get(snapshot, "value"));
      if (!parsed.ok) throw new Error(parsed.error.message);
      return parsed.value;
    } catch (reason) {
      throw new Error(`Carapace probe failed: ${renderUnknownReason(reason)}`);
    }
  };
  const runReset = (): undefined => {
    try {
      const returned: unknown = reset();
      return requireSynchronousResetResult(returned);
    } catch (reason) {
      throw new Error(`Carapace reset failed: ${renderUnknownReason(reason)}`);
    }
  };
  const bridge: CarapaceBrowserBridge = Object.freeze({
    schema: CARAPACE_BROWSER_BRIDGE_SCHEMA,
    snapshot: readSnapshot,
    reset: runReset,
    coverage,
  });
  const installed = new Map<string, unknown>([["__carapace", bridge]]);

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
      restoreInstalledValue(target, key, installed.get(key), rollbackDescriptors.get(key));
    }
    return err(bridgeError(
      "install-failed",
      renderUnknownReason(reason, "Carapace browser bridge installation failed"),
    ));
  }

  let state: "prepared" | "committed" | "closed" = "prepared";
  const rollback = (): undefined => {
    if (state !== "prepared") return undefined;
    state = "closed";
    for (const key of BRIDGE_KEYS) {
      restoreInstalledValue(target, key, installed.get(key), rollbackDescriptors.get(key));
    }
    return undefined;
  };
  const deactivate = (): undefined => {
    if (state !== "committed") return undefined;
    state = "closed";
    if (activeBridgeInstallation === installation) activeBridgeInstallation = null;
    return undefined;
  };
  const uninstall = (): undefined => {
    if (state === "prepared") return rollback();
    if (state !== "committed") return undefined;
    state = "closed";
    for (const key of BRIDGE_KEYS) {
      restoreInstalledValue(target, key, installed.get(key), restore.get(key));
    }
    if (activeBridgeInstallation === installation) activeBridgeInstallation = null;
    return undefined;
  };
  const installation: ActiveBridgeInstallation = Object.freeze({
    target,
    installed,
    restore,
    deactivate,
    uninstall,
  });
  const commit = (): undefined => {
    if (state !== "prepared") return undefined;
    state = "committed";
    if (previousInstallation !== null) {
      if (previousInstallation.target === target) previousInstallation.deactivate();
      else previousInstallation.uninstall();
    }
    activeBridgeInstallation = installation;
    return undefined;
  };

  return ok(Object.freeze({
    commit,
    rollback,
    uninstall,
  }));
}

/**
 * Install one process-local browser automation bridge. A later installation
 * restores and replaces the earlier one; stale uninstall handles are harmless.
 */
export function installCarapaceBrowserBridge(
  options: CarapaceBrowserBridgeOptions,
): Result<CarapaceBrowserBridgeUninstall, CarapaceBrowserBridgeError> {
  const prepared = prepareCarapaceBrowserBridgeInstallation(options);
  if (!prepared.ok) return prepared;
  prepared.value.commit();
  return ok(prepared.value.uninstall);
}
