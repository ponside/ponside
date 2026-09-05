import "server-only";

const SENSITIVE_KEYS = /authorization|cookie|secret|token|password|key/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.test(key) ? "[redacted]" : sanitize(item)]));
  }
  return value;
}

export function logEvent(level: "info" | "warn" | "error", event: string, context: Record<string, unknown> = {}) {
  const safeContext = sanitize(context) as Record<string, unknown>;
  const payload = JSON.stringify({ level, event, at: new Date().toISOString(), ...safeContext });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}
