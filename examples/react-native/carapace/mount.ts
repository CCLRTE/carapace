import {
  createCoverageCatalogSnapshot,
  err,
  ok,
  type Result,
} from "@cclrte/carapace";
import type { CarapaceSession } from "@cclrte/carapace/testing";
import {
  installCarapaceBrowserBridge,
  installCarapaceFetchFirewall,
} from "@cclrte/carapace/web";

import {
  deviceStatusCarapaceDefinition,
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

/** Own one complete browser installation so React effect replay can replace it safely. */
export function mountDeviceStatusCarapace(
  source: string,
): Result<MountedDeviceStatusCarapace, DeviceStatusCarapaceMountError> {
  const created = createDeviceStatusCarapaceSession(source);
  if (!created.ok) return err(Object.freeze({ message: created.error.message }));

  const session = created.value;
  const uninstallFirewall = installCarapaceFetchFirewall({
    onBlocked: session.product.recordBlockedNetworkRequest,
  });
  const bridge = installCarapaceBrowserBridge({
    probe: session.probe,
    coverage: createCoverageCatalogSnapshot(deviceStatusCarapaceDefinition.coverage),
  });
  if (!bridge.ok) {
    uninstallFirewall();
    session.dispose();
    return err(Object.freeze({ message: bridge.error.message }));
  }

  let disposed = false;
  return ok(Object.freeze({
    session,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      bridge.value();
      uninstallFirewall();
      session.dispose();
    },
  }));
}
