import type { JsonValue } from "./json-value.js";

export type ResourceState<Value extends JsonValue, Failure extends JsonValue = string> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: Value }
  | { readonly status: "empty" }
  | { readonly status: "error"; readonly error: Failure }
  | { readonly status: "offline"; readonly error: Failure | null }
  | { readonly status: "unauthorized"; readonly reason: Failure | null };
