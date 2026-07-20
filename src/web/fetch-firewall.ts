export interface CarapaceFetchFirewallOptions {
  readonly allow?: (url: URL) => boolean;
  readonly beginActivity?: (url: URL | null) => () => void;
  readonly onBlocked?: (url: URL | null) => void;
  readonly originalFetch?: FetchCall;
}

type FetchCall = (...arguments_: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

let uninstallActiveFirewall: (() => void) | null = null;

function requestUrl(input: Parameters<typeof fetch>[0]): URL | null {
  try {
    if (input instanceof Request) return new URL(input.url);
    const browserGlobal = globalThis as typeof globalThis & { readonly location?: { readonly origin?: string } };
    const locationOrigin = browserGlobal.location?.origin;
    const base = locationOrigin === undefined || locationOrigin === "null"
      ? "http://carapace.invalid"
      : locationOrigin;
    return new URL(String(input), base);
  } catch {
    return null;
  }
}

/** Install one process-local, fail-closed fetch boundary for a browser Carapace frame. */
export function installCarapaceFetchFirewall(
  options: CarapaceFetchFirewallOptions = {},
): () => void {
  uninstallActiveFirewall?.();
  const previousFetch = globalThis.fetch;
  const originalFetch: FetchCall = options.originalFetch ?? previousFetch;
  const guardedCall: FetchCall = async (input, init) => {
    const url = requestUrl(input);
    const release = options.beginActivity?.(url) ?? (() => undefined);
    try {
      if (url !== null && options.allow?.(url) === true) {
        return await originalFetch(input, init);
      }
      options.onBlocked?.(url);
      return new Response(
        JSON.stringify({ error: "Carapace blocked an unmapped network request." }),
        { status: 501, headers: { "content-type": "application/json" } },
      );
    } finally {
      release();
    }
  };
  const previousPreconnect = Reflect.get(previousFetch, "preconnect") as unknown;
  if (typeof previousPreconnect === "function") {
    Object.defineProperty(guardedCall, "preconnect", {
      configurable: true,
      value: (...arguments_: unknown[]): void => {
        Reflect.apply(previousPreconnect, previousFetch, arguments_);
      },
    });
  }
  const guardedFetch = guardedCall as typeof fetch;
  globalThis.fetch = guardedFetch;
  let active = true;
  const uninstall = (): void => {
    if (!active) return;
    active = false;
    if (globalThis.fetch === guardedFetch) globalThis.fetch = previousFetch;
    if (uninstallActiveFirewall === uninstall) uninstallActiveFirewall = null;
  };
  uninstallActiveFirewall = uninstall;
  return uninstall;
}
