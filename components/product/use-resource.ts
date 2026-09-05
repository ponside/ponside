"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/client/api";
import { useProductAuth } from "@/components/product/product-providers";

export function useApiResource<T>(path: string | null, options: { requiresAuth?: boolean } = {}) {
  const auth = useProductAuth();
  const { ready, authenticated, getToken } = auth;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const load = useCallback(async () => {
    if (!path || (options.requiresAuth && (!ready || !authenticated))) { setLoading(false); setData(null); return; }
    setLoading(true);
    try { const token = ready && authenticated ? await getToken() : null; setData(await apiRequest<T>(path, {}, token)); setError(null); }
    catch (cause) { setData(null); setError(cause instanceof Error ? cause.message : "The request failed."); }
    finally { setLoading(false); }
  }, [path, options.requiresAuth, ready, authenticated, getToken]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  return { data, error, loading, refresh: load, setData };
}
