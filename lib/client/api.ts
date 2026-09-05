"use client";

import type { ApiErrorBody } from "@/lib/domain";

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, accessToken?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  const response = await fetch(path, { ...options, headers, cache: "no-store" });
  const payload = await response.json().catch(() => null) as { data?: T } | ApiErrorBody | null;
  if (!response.ok) {
    const failure = payload && "error" in payload ? payload.error : null;
    throw new ApiClientError(response.status, failure?.code || "REQUEST_FAILED", failure?.message || "The request failed.");
  }
  if (!payload || !("data" in payload)) throw new ApiClientError(502, "INVALID_RESPONSE", "The server returned an invalid response.");
  return payload.data as T;
}

