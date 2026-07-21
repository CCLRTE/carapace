import { DeviceStatusApp } from "./DeviceStatusApp";
import { createNativeDeviceStatusPort } from "./native-device-status-port";

const port = createNativeDeviceStatusPort();

export default function NativeRoot() {
  return <DeviceStatusApp port={port} />;
}
