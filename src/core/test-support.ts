import fc from "fast-check";
import type { IAsyncProperty, IProperty, Parameters } from "fast-check";

import { isRecord } from "./result.js";
import { createScenarioCatalog, type ScenarioCatalog } from "./scenario.js";

export { fc };

export const propertyParameters = Object.freeze({
  interruptAfterTimeLimit: 10_000,
  markInterruptAsFailure: true,
  numRuns: 200,
}) satisfies Parameters<unknown>;

/** Run a synchronous property with bounded, replayable standalone defaults. */
export function assertProperty<Values>(
  property: IProperty<Values>,
  overrides: Parameters<Values> = {},
): void {
  fc.assert(property, { ...propertyParameters, ...overrides });
}

/** Run an asynchronous property with the same standalone defaults. */
export async function assertAsyncProperty<Values>(
  property: IAsyncProperty<Values>,
  overrides: Parameters<Values> = {},
): Promise<void> {
  await fc.assert(property, { ...propertyParameters, ...overrides });
}

export type TestRoute = "/chat" | "/settings";

export type TestWorld = {
  count: number;
  messages: string[];
};

export function parseTestWorld(input: unknown): TestWorld {
  if (!isRecord(input) || typeof input.count !== "number" || !Number.isSafeInteger(input.count)) {
    throw new Error("Test world count must be a safe integer");
  }
  if (!Array.isArray(input.messages) || !input.messages.every((message) => typeof message === "string")) {
    throw new Error("Test world messages must be strings");
  }
  return { count: input.count, messages: [...input.messages] };
}

export function testScenarios(): ScenarioCatalog<TestWorld, TestRoute> {
  const catalog = createScenarioCatalog<TestWorld, TestRoute>([
    {
      id: "chat.empty",
      title: "Empty chat",
      route: "/chat",
      world: { count: 0, messages: [] },
    },
    {
      id: "settings.ready",
      title: "Ready settings",
      route: "/settings",
      world: { count: 1, messages: ["ready"] },
    },
  ], parseTestWorld);
  if (!catalog.ok) {
    throw new Error(catalog.error.message);
  }
  return catalog.value;
}
