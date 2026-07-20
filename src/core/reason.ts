/** Render a foreign thrown value without trusting its prototype, getters, or coercion hooks. */
export function renderUnknownReason(reason: unknown, fallback = "Unknown failure"): string {
  try {
    if ((typeof reason === "object" && reason !== null) || typeof reason === "function") {
      const message = Reflect.get(reason, "message") as unknown;
      if (typeof message === "string") return message;
    }
  } catch {
    // Fall through to guarded primitive coercion.
  }
  try {
    return String(reason);
  } catch {
    return fallback;
  }
}
