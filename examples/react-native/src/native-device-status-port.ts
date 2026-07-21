import { Appearance, Platform } from "react-native";

import {
  cloneDeviceStatus,
  DeviceStatusPortError,
  type DevicePlatform,
  type DeviceStatusPort,
} from "./device-status-port";

function nativePlatform(): DevicePlatform {
  switch (Platform.OS) {
    case "android":
    case "ios":
      return Platform.OS;
    case "macos":
    case "web":
    case "windows":
      throw new DeviceStatusPortError(
        `device-status-example/native-port/v1: Unsupported production platform: ${Platform.OS}`,
      );
  }
}

export function createNativeDeviceStatusPort(): DeviceStatusPort {
  return Object.freeze({
    inspect: () => Promise.resolve(cloneDeviceStatus({
      platform: nativePlatform(),
      colorScheme: Appearance.getColorScheme() === "dark" ? "dark" : "light",
      capturedAt: new Date().toISOString(),
    })),
  });
}
