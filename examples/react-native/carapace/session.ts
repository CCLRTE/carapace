import { createCarapaceSession } from "@cclrte/carapace/testing";

import type { DeviceStatusPort } from "../src/device-status-port";
import {
  deviceStatusCarapaceDefinition,
  type DeviceStatusCarapaceRoute,
} from "./definition";
import { createDeterministicDeviceStatusPort } from "./deterministic-device-status-port";
import type { DeviceStatusCarapaceWorld } from "./world";

export interface DeviceStatusCarapaceHarness {
  readonly port: DeviceStatusPort;
  readonly pendingOperations: () => number;
  readonly blockedNetworkRequests: () => number;
  readonly recordBlockedNetworkRequest: () => void;
  readonly remainingWork: () => unknown;
}

export function createDeviceStatusCarapaceSession(source: string) {
  return createCarapaceSession<
    DeviceStatusCarapaceWorld,
    DeviceStatusCarapaceRoute,
    DeviceStatusCarapaceHarness
  >({
    definition: deviceStatusCarapaceDefinition,
    activation: { kind: "query", source },
    create: (context): DeviceStatusCarapaceHarness => {
      const port = createDeterministicDeviceStatusPort({
        world: context.world,
        activity: context.activity,
        clock: context.clock,
        signal: context.signal,
      });
      context.onDispose(port.dispose);
      let blockedNetworkRequests = 0;
      return Object.freeze({
        port,
        pendingOperations: port.pendingOperations,
        blockedNetworkRequests: () => blockedNetworkRequests,
        recordBlockedNetworkRequest: () => {
          blockedNetworkRequests += 1;
        },
        remainingWork: () => Object.freeze({
          deviceStatus: port.remainingWork(),
          blockedNetworkRequests,
        }),
      });
    },
    observe: (harness) => ({
      pending: [{ name: "deviceInspections", read: harness.pendingOperations }],
      violations: [{ name: "blockedNetworkRequests", read: harness.blockedNetworkRequests }],
      readRemainingWork: harness.remainingWork,
    }),
  });
}
