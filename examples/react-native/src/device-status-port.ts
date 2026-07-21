export type DevicePlatform = "android" | "ios";
export type DeviceColorScheme = "dark" | "light";

export interface DeviceStatus {
  readonly platform: DevicePlatform;
  readonly colorScheme: DeviceColorScheme;
  readonly capturedAt: string;
}

export interface DeviceStatusPort {
  readonly inspect: () => Promise<DeviceStatus>;
}

export class DeviceStatusPortError extends Error {
  readonly code: "inspection-failed";

  constructor(message: string) {
    super(message);
    this.name = "DeviceStatusPortError";
    this.code = "inspection-failed";
  }
}

export function cloneDeviceStatus(status: DeviceStatus): DeviceStatus {
  return Object.freeze({ ...status });
}
