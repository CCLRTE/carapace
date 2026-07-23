import {
  CARAPACE_BROWSER_BRIDGE_SCHEMA as browserBridgeSchema,
  installCarapaceBrowserBridge as installBrowserBridge,
} from "./web/browser-bridge.js";
import {
  installCarapaceFetchFirewall as installFetchFirewall,
} from "./web/fetch-firewall.js";

export * from "./web/browser.js";
export const CARAPACE_BROWSER_BRIDGE_SCHEMA = browserBridgeSchema;
export const installCarapaceBrowserBridge: typeof installBrowserBridge = (
  options,
) => installBrowserBridge(options);
export type {
  CarapaceBrowserBridge,
  CarapaceBrowserBridgeError,
  CarapaceBrowserBridgeErrorCode,
  CarapaceBrowserBridgeOptions,
  CarapaceBrowserBridgeUninstall,
} from "./web/browser-bridge.js";
export const installCarapaceFetchFirewall: typeof installFetchFirewall = (
  options,
) => installFetchFirewall(options);
export type {
  CarapaceFetchFirewallOptions,
  CarapaceFetchFirewallUninstall,
} from "./web/fetch-firewall.js";
