import { afterEach, describe, expect, test } from "bun:test";

import { installCarapaceFetchFirewall } from "./fetch-firewall.js";

const nativeFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = nativeFetch;
});

describe("Carapace fetch firewall", () => {
  test("blocks relative, same-origin, malformed, and external requests without reaching fetch", async () => {
    let calls = 0;
    let active = 0;
    const blocked: (URL | null)[] = [];
    const uninstall = installCarapaceFetchFirewall({
      originalFetch: () => {
        calls += 1;
        return Promise.reject(new Error("must not reach network"));
      },
      beginActivity: () => {
        active += 1;
        return () => { active -= 1; };
      },
      onBlocked: (url) => blocked.push(url),
    });

    for (const url of ["/api/agent", "http://carapace.invalid/api/chat", "https://example.com/"]) {
      const response = await fetch(url);
      expect(response.status).toBe(501);
      expect(await response.json()).toEqual({ error: "Carapace blocked an unmapped network request." });
    }
    expect(calls).toBe(0);
    expect(active).toBe(0);
    expect(blocked).toHaveLength(3);
    uninstall();
  });

  test("allows only an explicit mapping and restores the previous fetch idempotently", async () => {
    let calls = 0;
    const original: typeof fetch = Object.assign(() => {
      calls += 1;
      return Promise.resolve(new Response("fixture"));
    }, { preconnect: nativeFetch.preconnect });
    const uninstall = installCarapaceFetchFirewall({
      originalFetch: original,
      allow: (url) => url.protocol === "data:",
    });

    expect(await (await fetch("data:text/plain,hello")).text()).toBe("fixture");
    expect((await fetch("https://example.com")).status).toBe(501);
    expect(calls).toBe(1);
    uninstall();
    uninstall();
    expect(globalThis.fetch).toBe(nativeFetch);
  });

  test("a later installation safely replaces the earlier firewall", () => {
    const first = installCarapaceFetchFirewall();
    const firstFetch = globalThis.fetch;
    const second = installCarapaceFetchFirewall();
    expect(globalThis.fetch).not.toBe(firstFetch);
    first();
    expect(globalThis.fetch).not.toBe(nativeFetch);
    second();
    expect(globalThis.fetch).toBe(nativeFetch);
  });
});
