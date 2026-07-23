import type { CarapaceSession } from "@cclrte/carapace/testing";
import { installCarapaceBrowser } from "@cclrte/carapace/web";

import {
  type DeviceStatusCarapaceRoute,
} from "./definition";
import {
  createDeviceStatusCarapaceSession,
  type DeviceStatusCarapaceHarness,
} from "./session";
import type { DeviceStatusCarapaceWorld } from "./world";

export type DeviceStatusSession = CarapaceSession<
  DeviceStatusCarapaceWorld,
  DeviceStatusCarapaceRoute,
  DeviceStatusCarapaceHarness
>;

export interface MountedDeviceStatusCarapace {
  readonly session: DeviceStatusSession;
  readonly dispose: () => void;
}

export interface DeviceStatusCarapaceMountError {
  readonly message: string;
}

export type DeviceStatusCarapaceMountResult =
  | { readonly ok: true; readonly value: MountedDeviceStatusCarapace }
  | { readonly ok: false; readonly error: DeviceStatusCarapaceMountError };

/** Own one complete browser installation so React effect replay can replace it safely. */
export function mountDeviceStatusCarapace(
  source: string,
): DeviceStatusCarapaceMountResult {
  const created = createDeviceStatusCarapaceSession(source);
  if (!created.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({ message: created.error.message }),
    });
  }

  const session = created.value;
  const browser = installCarapaceBrowser({
    session,
    firewall: { onBlocked: session.harness.recordBlockedNetworkRequest },
  });
  if (!browser.ok) {
    session.dispose();
    return Object.freeze({
      ok: false,
      error: Object.freeze({ message: browser.error.message }),
    });
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({ session, dispose: session.dispose }),
  });
}
