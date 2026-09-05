import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConfigurationError } from "@/lib/server/env";
import { logEvent } from "@/lib/server/logging";

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin) {
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new HttpError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
    return;
  }
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw new HttpError(403, "INVALID_ORIGIN", "The request origin is not allowed.");
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function routeError(error: unknown, request?: Request) {
  const requestId = crypto.randomUUID();
  if (error instanceof HttpError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, requestId } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: error.issues[0]?.message || "Invalid request.", requestId } }, { status: 400 });
  }
  if (error instanceof ConfigurationError) {
    logEvent("warn", "request.configuration_missing", { requestId, path: request ? new URL(request.url).pathname : undefined, missing: error.missing });
    return NextResponse.json({ error: { code: error.code, message: "This service is not configured yet.", requestId } }, { status: 503 });
  }
  logEvent("error", "request.unhandled_error", { requestId, path: request ? new URL(request.url).pathname : undefined, message: error instanceof Error ? error.message : String(error) });
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed.", requestId } }, { status: 500 });
}
