import { expect, test } from "bun:test";
import { assertProperty, fc } from "./test-support.js";
import { canonicalJson, parseAndCloneWorld, parseJsonValue, stableHash } from "./json.js";

test("property: strict JSON parsing is total over arbitrary JavaScript values", () => {
  assertProperty(fc.property(fc.anything({ withBigInt: true, withMap: true, withSet: true }), (value) => {
    expect(() => parseJsonValue(value)).not.toThrow();
    const parsed = parseJsonValue(value);
    expect(typeof parsed.ok).toBe("boolean");
  }));
});

test("hostile inspection failures remain structured JSON boundary errors", () => {
  const hostileReason = new Proxy(new Error("hostile"), {
    get: () => {
      throw new Error("hostile message getter");
    },
    getPrototypeOf: () => {
      throw new Error("hostile prototype");
    },
  });
  const input = new Proxy({}, {
    getPrototypeOf: () => {
      throw hostileReason;
    },
  });
  expect(parseJsonValue(input)).toEqual({
    ok: false,
    error: {
      code: "invalid-object",
      path: "$",
      message: "JSON object inspection failed",
    },
  });
});

test("property: canonical JSON round trips and hashes identically", () => {
  assertProperty(fc.property(fc.jsonValue(), (value) => {
    const first = canonicalJson(value);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const roundTripped = JSON.parse(first.value) as unknown;
    expect(canonicalJson(roundTripped)).toEqual(first);
    expect(stableHash(roundTripped)).toEqual(stableHash(value));
  }));
});

test("prototype-shaped keys remain own JSON data and participate in canonical hashes", () => {
  const input = JSON.parse('{"__proto__":{"polluted":true},"safe":1}') as unknown;
  const parsed = parseJsonValue(input);

  expect(parsed.ok).toBe(true);
  if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    throw new Error("expected a parsed JSON object");
  }
  const object = parsed.value as Record<string, unknown>;
  expect(Object.getPrototypeOf(object)).toBeNull();
  expect(Object.hasOwn(object, "__proto__")).toBe(true);
  expect(object["__proto__"]).toEqual({ polluted: true });
  expect(canonicalJson(input)).toEqual({
    ok: true,
    value: '{"__proto__":{"polluted":true},"safe":1}',
  });
  expect(stableHash(input)).not.toEqual(stableHash({ safe: 1 }));
});

test("world parsers cannot leak or freeze caller-owned aliases", () => {
  const shared = { count: 1, messages: ["external"] };
  const parsed = parseAndCloneWorld({ ignored: true }, () => shared);

  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error.message);
  expect(parsed.value).toEqual(shared);
  expect(parsed.value).not.toBe(shared);
  expect(Object.isFrozen(parsed.value)).toBe(true);
  expect(Object.isFrozen(parsed.value.messages)).toBe(true);
  expect(Object.isFrozen(shared)).toBe(false);
  shared.count = 9;
  expect(parsed.value.count).toBe(1);
});

test("arrays reject accessors, hidden keys, custom prototypes, and extra properties", () => {
  let getterCalls = 0;
  const accessor = ["safe"];
  Object.defineProperty(accessor, 0, {
    enumerable: true,
    get: () => {
      getterCalls += 1;
      return "unsafe";
    },
  });
  expect(parseJsonValue(accessor)).toMatchObject({
    ok: false,
    error: { code: "accessor-property", path: "$[0]" },
  });
  expect(getterCalls).toBe(0);

  const extra = [1] as number[] & { hidden?: boolean };
  extra.hidden = true;
  expect(parseJsonValue(extra)).toMatchObject({
    ok: false,
    error: { code: "invalid-object", path: "$.hidden" },
  });

  const custom = [1];
  const customPrototype = Object.create(Array.prototype) as object;
  Object.setPrototypeOf(custom, customPrototype);
  expect(parseJsonValue(custom)).toMatchObject({
    ok: false,
    error: { code: "invalid-object" },
  });
});
