import {
  EMPTY_COVERAGE_CATALOG_SNAPSHOT,
  parseCoverageCatalogSnapshot
} from "./index-ym9pc4q7.js";
import {
  cloneJson,
  err,
  freezeJson,
  ok,
  renderUnknownReason
} from "./index-nv4eqpe5.js";

// src/web/browser-bridge.ts
var CARAPACE_BROWSER_BRIDGE_SCHEMA = "carapace.browser-bridge/v1";
var BRIDGE_KEYS = [
  "__carapace",
  "__carapaceActivitySnapshot",
  "__carapaceReset",
  "__carapaceCoverage"
];
var activeBridgeInstallation = null;
function bridgeError(code, message) {
  return Object.freeze({ code, message });
}
function defaultReset() {
  const target = globalThis;
  target.location?.reload?.();
}
function restoreDescriptor(target, key, descriptor) {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, key);
  } else {
    Object.defineProperty(target, key, descriptor);
  }
}
function restoreInstalledValue(target, key, installedValue, previous) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor?.value === installedValue)
      restoreDescriptor(target, key, previous);
  } catch {}
}
function installCarapaceBrowserBridge(options) {
  let coverageInput;
  try {
    coverageInput = options.coverage === undefined ? EMPTY_COVERAGE_CATALOG_SNAPSHOT : options.coverage;
  } catch (reason) {
    return err(bridgeError("invalid-coverage", renderUnknownReason(reason, "Failed to read Carapace coverage")));
  }
  const parsedCoverage = parseCoverageCatalogSnapshot(coverageInput);
  if (!parsedCoverage.ok) {
    return err(bridgeError("invalid-coverage", parsedCoverage.error.message));
  }
  const coverage = parsedCoverage.value;
  let target;
  let reset;
  let probe;
  let legacyActivitySnapshot;
  try {
    target = options.target ?? globalThis;
    reset = options.reset ?? defaultReset;
    probe = options.probe;
    legacyActivitySnapshot = options.legacyActivitySnapshot;
  } catch (reason) {
    return err(bridgeError("install-failed", renderUnknownReason(reason, "Failed to read Carapace browser bridge options")));
  }
  const previousInstallation = activeBridgeInstallation;
  const rollback = new Map;
  const restore = new Map;
  try {
    for (const key of BRIDGE_KEYS) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      rollback.set(key, descriptor);
      const previousOwnsValue = previousInstallation?.target === target && descriptor?.value === previousInstallation.installed.get(key);
      restore.set(key, previousOwnsValue ? previousInstallation.restore.get(key) : descriptor);
    }
  } catch (reason) {
    return err(bridgeError("install-failed", renderUnknownReason(reason, "Failed to inspect the Carapace browser bridge target")));
  }
  const readSnapshot = () => {
    try {
      const snapshot = probe.snapshot();
      if (!snapshot.ok)
        throw new Error(renderUnknownReason(snapshot.error));
      return snapshot.value;
    } catch (reason) {
      throw new Error(`Carapace probe failed: ${renderUnknownReason(reason)}`);
    }
  };
  const readLegacySnapshot = () => {
    const canonical = readSnapshot();
    let candidate;
    try {
      candidate = legacyActivitySnapshot === undefined ? canonical : legacyActivitySnapshot(canonical);
    } catch (reason) {
      throw new Error(`Carapace legacy snapshot failed: ${renderUnknownReason(reason)}`);
    }
    const cloned = cloneJson(candidate);
    if (!cloned.ok)
      throw new Error(`Carapace legacy snapshot is not JSON-safe: ${cloned.error.message}`);
    return freezeJson(cloned.value);
  };
  const bridge = Object.freeze({
    schema: CARAPACE_BROWSER_BRIDGE_SCHEMA,
    snapshot: readSnapshot,
    reset,
    coverage
  });
  const installed = new Map([
    ["__carapace", bridge],
    ["__carapaceActivitySnapshot", readLegacySnapshot],
    ["__carapaceReset", reset],
    ["__carapaceCoverage", coverage]
  ]);
  try {
    for (const [key, value] of installed) {
      Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value
      });
    }
  } catch (reason) {
    for (const key of BRIDGE_KEYS) {
      restoreInstalledValue(target, key, installed.get(key), rollback.get(key));
    }
    return err(bridgeError("install-failed", renderUnknownReason(reason, "Carapace browser bridge installation failed")));
  }
  let active = true;
  const installation = Object.freeze({
    target,
    installed,
    restore,
    deactivate: () => {
      if (!active)
        return;
      active = false;
      if (activeBridgeInstallation === installation)
        activeBridgeInstallation = null;
    },
    uninstall: () => {
      if (!active)
        return;
      active = false;
      for (const key of BRIDGE_KEYS) {
        restoreInstalledValue(target, key, installed.get(key), restore.get(key));
      }
      if (activeBridgeInstallation === installation)
        activeBridgeInstallation = null;
    }
  });
  if (previousInstallation !== null) {
    if (previousInstallation.target === target)
      previousInstallation.deactivate();
    else
      previousInstallation.uninstall();
  }
  activeBridgeInstallation = installation;
  return ok(installation.uninstall);
}
// src/web/fetch-firewall.ts
var uninstallActiveFirewall = null;
function requestUrl(input) {
  try {
    if (input instanceof Request)
      return new URL(input.url);
    const browserGlobal = globalThis;
    const locationOrigin = browserGlobal.location?.origin;
    const base = locationOrigin === undefined || locationOrigin === "null" ? "http://carapace.invalid" : locationOrigin;
    return new URL(String(input), base);
  } catch {
    return null;
  }
}
function installCarapaceFetchFirewall(options = {}) {
  uninstallActiveFirewall?.();
  const previousFetch = globalThis.fetch;
  const originalFetch = options.originalFetch ?? previousFetch;
  const guardedCall = async (input, init) => {
    const url = requestUrl(input);
    const release = options.beginActivity?.(url) ?? (() => {
      return;
    });
    try {
      if (url !== null && options.allow?.(url) === true) {
        return await originalFetch(input, init);
      }
      options.onBlocked?.(url);
      return new Response(JSON.stringify({ error: "Carapace blocked an unmapped network request." }), { status: 501, headers: { "content-type": "application/json" } });
    } finally {
      release();
    }
  };
  const previousPreconnect = Reflect.get(previousFetch, "preconnect");
  if (typeof previousPreconnect === "function") {
    Object.defineProperty(guardedCall, "preconnect", {
      configurable: true,
      value: (...arguments_) => {
        Reflect.apply(previousPreconnect, previousFetch, arguments_);
      }
    });
  }
  const guardedFetch = guardedCall;
  globalThis.fetch = guardedFetch;
  let active = true;
  const uninstall = () => {
    if (!active)
      return;
    active = false;
    if (globalThis.fetch === guardedFetch)
      globalThis.fetch = previousFetch;
    if (uninstallActiveFirewall === uninstall)
      uninstallActiveFirewall = null;
  };
  uninstallActiveFirewall = uninstall;
  return uninstall;
}
export {
  installCarapaceFetchFirewall,
  installCarapaceBrowserBridge,
  CARAPACE_BROWSER_BRIDGE_SCHEMA
};
