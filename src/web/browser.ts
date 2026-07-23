import type { JsonValue } from "../core/json-value.js";
import { renderUnknownReason } from "../core/reason.js";
import { err, ok, type Result } from "../core/result.js";
import type { CarapaceActivityScopeError } from "../testing/activity.js";
import type { CarapaceProbe } from "../testing/probe.js";
import type {
  CarapaceSession,
  CarapaceSessionRegistrationError,
} from "../testing/session.js";
import {
  prepareCarapaceBrowserBridgeInstallation,
  type CarapaceBrowserBridgeError,
  type CarapaceBrowserBridgeUninstall,
  type PreparedCarapaceBrowserBridgeInstallation,
} from "./browser-bridge.js";
import {
  prepareCarapaceFetchFirewallInstallation,
  type CarapaceFetchFirewallOptions,
  type CarapaceFetchFirewallUninstall,
  type PreparedCarapaceFetchFirewallInstallation,
} from "./fetch-firewall.js";

export interface CarapaceBrowserFirewallOptions extends Omit<
  CarapaceFetchFirewallOptions,
  "beginActivity"
> {
  /** Observe activity bookkeeping failures without allowing them to escape the fetch boundary. */
  readonly onActivityError?: (error: CarapaceActivityScopeError) => void;
}

export interface InstallCarapaceBrowserOptions<
  World extends JsonValue,
  Route extends string,
  Harness,
> {
  /** The installation registers its teardown with this session. */
  readonly session: CarapaceSession<World, Route, Harness>;
  readonly reset?: () => undefined;
  readonly target?: object;
  /** Fail closed by default. Set false only when another boundary owns application fetch. */
  readonly firewall?: CarapaceBrowserFirewallOptions | false;
}

export type CarapaceBrowserInstallError =
  | {
    readonly code: "invalid-options" | "firewall-install-failed";
    readonly message: string;
    readonly bridgeError: null;
    readonly registrationError: null;
    readonly rollbackErrors: readonly string[];
  }
  | {
    readonly code: "bridge-install-failed";
    readonly message: string;
    readonly bridgeError: CarapaceBrowserBridgeError;
    readonly registrationError: null;
    readonly rollbackErrors: readonly string[];
  }
  | {
    readonly code: "session-registration-failed";
    readonly message: string;
    readonly bridgeError: null;
    readonly registrationError: CarapaceSessionRegistrationError;
    readonly rollbackErrors: readonly string[];
  }
  | {
    readonly code: "session-registration-threw";
    readonly message: string;
    readonly bridgeError: null;
    readonly registrationError: null;
    readonly rollbackErrors: readonly string[];
  };

export interface CarapaceBrowserInstallation {
  /** Uninstall browser globals and the fetch firewall without disposing the owning session. */
  readonly dispose: () => undefined;
  readonly isDisposed: () => boolean;
  /** Best-effort disposal always attempts both browser boundaries. */
  readonly disposalErrors: () => readonly string[];
}

function freezeMessages(messages: readonly string[]): readonly string[] {
  return Object.freeze([...messages]);
}

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
    // Promise assimilation is foreign code. Reporting remains observational.
  }
  return true;
}

function notifyActivityError(
  observer: ((error: CarapaceActivityScopeError) => void) | undefined,
  error: CarapaceActivityScopeError,
): void {
  if (observer === undefined) return;
  try {
    const returned: unknown = observer(error);
    containPromiseLike(returned);
  } catch {
    // Reporting cannot weaken the fail-closed activity boundary.
  }
}

function runBrowserCleanup(
  bridge: CarapaceBrowserBridgeUninstall | null,
  firewall: CarapaceFetchFirewallUninstall | null,
): readonly string[] {
  const errors: string[] = [];
  for (const [label, cleanup] of [
    ["bridge", bridge],
    ["firewall", firewall],
  ] as const) {
    if (cleanup === null) continue;
    try {
      const returned: unknown = cleanup();
      if (returned !== undefined) {
        containPromiseLike(returned);
        errors.push(`Carapace browser ${label} cleanup must return undefined`);
      }
    } catch (reason) {
      errors.push(renderUnknownReason(reason, `Carapace browser ${label} cleanup failed`));
    }
  }
  return freezeMessages(errors);
}

/**
 * Install the canonical browser bridge and fail-closed fetch boundary around
 * one session. Installation is failure-atomic and teardown is registered with
 * the session, so session disposal remains the aggregate lifecycle boundary.
 */
export function installCarapaceBrowser<
  World extends JsonValue,
  Route extends string,
  Harness,
>(
  options: InstallCarapaceBrowserOptions<World, Route, Harness>,
): Result<CarapaceBrowserInstallation, CarapaceBrowserInstallError> {
  let activity: CarapaceSession<World, Route, Harness>["activity"];
  let coverage: CarapaceSession<World, Route, Harness>["coverage"];
  let onDispose: CarapaceSession<World, Route, Harness>["onDispose"];
  let probe: CarapaceProbe;
  let reset: (() => undefined) | undefined;
  let target: object | undefined;
  let firewallOptions: CarapaceBrowserFirewallOptions | false;
  try {
    const session = options.session;
    activity = session.activity;
    coverage = session.coverage;
    onDispose = session.onDispose;
    probe = session.probe;
    reset = options.reset;
    target = options.target;
    firewallOptions = options.firewall ?? {};
  } catch (reason) {
    return err(Object.freeze({
      code: "invalid-options",
      message: renderUnknownReason(reason, "Carapace browser options could not be inspected"),
      bridgeError: null,
      registrationError: null,
      rollbackErrors: freezeMessages([]),
    }));
  }

  let preparedFirewall: PreparedCarapaceFetchFirewallInstallation | null = null;
  if (firewallOptions !== false) {
    try {
      const { onActivityError, ...lowLevelOptions } = firewallOptions;
      preparedFirewall = prepareCarapaceFetchFirewallInstallation({
        ...lowLevelOptions,
        beginActivity: () => {
          const started = activity.begin("browser-fetch");
          if (!started.ok) {
            notifyActivityError(onActivityError, started.error);
            throw new Error(started.error.message, { cause: started.error });
          }
          return (): undefined => {
            const released = started.value.release();
            if (!released.ok) notifyActivityError(onActivityError, released.error);
            return undefined;
          };
        },
      });
    } catch (reason) {
      return err(Object.freeze({
        code: "firewall-install-failed",
        message: renderUnknownReason(reason, "Carapace fetch firewall installation failed"),
        bridgeError: null,
        registrationError: null,
        rollbackErrors: freezeMessages([]),
      }));
    }
  }

  const preparedBridgeResult = prepareCarapaceBrowserBridgeInstallation({
    probe,
    coverage,
    ...(reset === undefined ? {} : { reset }),
    ...(target === undefined ? {} : { target }),
  });
  if (!preparedBridgeResult.ok) {
    const rollbackErrors = runBrowserCleanup(null, preparedFirewall?.rollback ?? null);
    return err(Object.freeze({
      code: "bridge-install-failed",
      message: preparedBridgeResult.error.message,
      bridgeError: preparedBridgeResult.error,
      registrationError: null,
      rollbackErrors,
    }));
  }
  const preparedBridge: PreparedCarapaceBrowserBridgeInstallation = preparedBridgeResult.value;

  let disposed = false;
  let committed = false;
  let disposalErrors: readonly string[] = freezeMessages([]);
  const dispose = (): undefined => {
    if (disposed) return undefined;
    disposed = true;
    disposalErrors = committed
      ? runBrowserCleanup(preparedBridge.uninstall, preparedFirewall?.uninstall ?? null)
      : runBrowserCleanup(preparedBridge.rollback, preparedFirewall?.rollback ?? null);
    return undefined;
  };
  const installation: CarapaceBrowserInstallation = Object.freeze({
    dispose,
    isDisposed: () => disposed,
    disposalErrors: () => disposalErrors,
  });
  try {
    const registered = onDispose(dispose);
    if (!registered.ok) {
      dispose();
      return err(Object.freeze({
        code: "session-registration-failed",
        message: registered.error.message,
        bridgeError: null,
        registrationError: registered.error,
        rollbackErrors: disposalErrors,
      }));
    }
  } catch (reason) {
    dispose();
    return err(Object.freeze({
      code: "session-registration-threw",
      message: renderUnknownReason(reason, "Carapace session cleanup registration failed"),
      bridgeError: null,
      registrationError: null,
      rollbackErrors: disposalErrors,
    }));
  }
  if (disposed) {
    return err(Object.freeze({
      code: "session-registration-threw",
      message: "Carapace session disposed browser ownership during cleanup registration",
      bridgeError: null,
      registrationError: null,
      rollbackErrors: disposalErrors,
    }));
  }
  preparedFirewall?.commit();
  preparedBridge.commit();
  committed = true;
  return ok(installation);
}
