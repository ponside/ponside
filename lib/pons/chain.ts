import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { getChainEnv, getIndexerRpcUrl } from "@/lib/server/env";
import { robinhoodChain } from "@/lib/pons/public-chain";

let client: PublicClient | undefined;
let indexerClient: PublicClient | undefined;

type JsonRpcPayload = { params?: unknown; [key: string]: unknown };

function withExplicitParams(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.map(withExplicitParams);
  if (!payload || typeof payload !== "object") return payload;
  const request = payload as JsonRpcPayload;
  return request.params === undefined ? { ...request, params: [] } : request;
}

function normalizeIndexerRequest(_request: Request, init: RequestInit) {
  if (typeof init.body !== "string") return init;
  try {
    const body = JSON.parse(init.body) as unknown;
    return { ...init, body: JSON.stringify(withExplicitParams(body)) };
  } catch {
    return init;
  }
}

export function getRobinhoodClient() {
  if (!client) client = createPublicClient({ chain: robinhoodChain, transport: http(getChainEnv().rpcUrl, { retryCount: 3, timeout: 15_000 }) });
  return client;
}

export function getRobinhoodIndexerClient() {
  if (!indexerClient) {
    indexerClient = createPublicClient({
      chain: robinhoodChain,
      transport: http(getIndexerRpcUrl(), { onFetchRequest: normalizeIndexerRequest, retryCount: 0, timeout: 30_000, maxResponseBodySize: 50_000_000 }),
    });
  }
  return indexerClient;
}
