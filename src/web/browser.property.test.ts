import { afterEach, describe, expect, test } from "bun:test";

import { defineCarapace } from "../core/definition.js";
import { assertProperty, fc, parseTestWorld } from "../core/test-support.js";
import { createCarapaceSession } from "../testing/session.js";
import type { CarapaceBrowserBridge } from "./browser-bridge.js";
import { installCarapaceBrowser } from "./browser.js";

const hostFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = hostFetch;
});

const definition = defineCarapace({
  parseWorld: parseTestWorld,
  defaultScenario: "chat.empty",
  scenarios: [{
    id: "chat.empty",
    title: "Empty chat",
    route: "/chat",
    world: { count: 0, messages: [] },
  }],
  coverage: [],
});

function createSession() {
  const session = createCarapaceSession({
    definition,
    activation: { kind: "query", source: "" },
    create: () => ({}),
  });
  if (!session.ok) throw new Error(session.error.message);
  return session.value;
}

describe("Carapace browser installation properties", () => {
  test("every fetch settles exactly once and every disposal sequence restores ownership", async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.boolean(), { maxLength: 40 }),
      fc.integer({ min: 0, max: 8 }),
      async (allowedRequests, extraDisposals) => {
        const session = createSession();
        const target: Record<string, unknown> = {};
        let blocked = 0;
        let allowed = 0;
        const originalFetch: typeof fetch = Object.assign(
          () => {
            allowed += 1;
            return Promise.resolve(new Response("fixture"));
          },
          { preconnect: hostFetch.preconnect },
        );
        const installed = installCarapaceBrowser({
          session,
          target,
          firewall: {
            allow: (url) => url.protocol === "data:",
            originalFetch,
            onBlocked: () => { blocked += 1; },
          },
        });
        if (!installed.ok) throw new Error(installed.error.message);

        for (const isAllowed of allowedRequests) {
          await fetch(isAllowed ? "data:text/plain,fixture" : "https://example.com/unmapped");
        }
        const snapshot = (target.__carapace as CarapaceBrowserBridge).snapshot();
        expect(snapshot.activity).toEqual({
          active: 0,
          started: allowedRequests.length,
          settled: allowedRequests.length,
        });
        expect(allowed).toBe(allowedRequests.filter(Boolean).length);
        expect(blocked).toBe(allowedRequests.filter((value) => !value).length);

        session.dispose();
        for (let index = 0; index < extraDisposals; index += 1) installed.value.dispose();
        expect(installed.value.isDisposed()).toBeTrue();
        expect(installed.value.disposalErrors()).toEqual([]);
        expect("__carapace" in target).toBeFalse();
        expect(globalThis.fetch).toBe(hostFetch);
      },
    ), { numRuns: 80 });
  });

  test("arbitrary prior bridge owners survive hostile replacement targets", () => {
    assertProperty(fc.property(
      fc.jsonValue(),
      (priorOwner) => {
        const session = createSession();
        const backing: Record<string, unknown> = { __carapace: priorOwner };
        const target = new Proxy(backing, {
          defineProperty: () => {
            throw new Error("generated target rejection");
          },
        });
        const installed = installCarapaceBrowser({ session, target });
        expect(installed.ok).toBeFalse();
        expect(backing.__carapace).toEqual(priorOwner);
        expect(globalThis.fetch).toBe(hostFetch);
        session.dispose();
      },
    ));
  });

  test("any number of failed replacements preserves the current installation", () => {
    assertProperty(fc.property(
      fc.integer({ min: 1, max: 20 }),
      (replacementCount) => {
        const target: Record<string, unknown> = {};
        const ownerSession = createSession();
        const owner = installCarapaceBrowser({ session: ownerSession, target });
        if (!owner.ok) throw new Error(owner.error.message);
        const ownerBridge = target.__carapace;
        const ownerFetch = globalThis.fetch;

        for (let index = 0; index < replacementCount; index += 1) {
          const disposedSession = createSession();
          disposedSession.dispose();
          expect(installCarapaceBrowser({ session: disposedSession, target }).ok).toBeFalse();
          expect(target.__carapace).toBe(ownerBridge);
          expect(globalThis.fetch).toBe(ownerFetch);
          expect(owner.value.isDisposed()).toBeFalse();
        }

        ownerSession.dispose();
        expect(owner.value.isDisposed()).toBeTrue();
        expect("__carapace" in target).toBeFalse();
        expect(globalThis.fetch).toBe(hostFetch);
      },
    ));
  });
});
