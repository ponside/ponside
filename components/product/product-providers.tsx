"use client";

import { PrivyProvider, useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PreparedTransaction, Profile, WalletTransactionUpdate } from "@/lib/domain";
import { ApiClientError, apiRequest } from "@/lib/client/api";
import { robinhoodChain } from "@/lib/pons/public-chain";

type ProductAuthValue = {
  configured: boolean;
  ready: boolean;
  authenticated: boolean;
  profile: Profile | null;
  error: string | null;
  login: (context?: string) => void;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  refreshProfile: () => Promise<void>;
  sendTransactions: (transactions: PreparedTransaction[], onUpdate?: (update: WalletTransactionUpdate) => void) => Promise<`0x${string}`[]>;
};

const unavailable: ProductAuthValue = {
  configured: false,
  ready: true,
  authenticated: false,
  profile: null,
  error: "Authentication is not configured yet.",
  login: () => undefined,
  logout: async () => undefined,
  getToken: async () => null,
  refreshProfile: async () => undefined,
  sendTransactions: async () => { throw new Error("Wallet transactions are unavailable until Privy is configured."); },
};

const ProductAuthContext = createContext<ProductAuthValue>(unavailable);

function isSafeProductReturnPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  const pathname = value.split(/[?#]/, 1)[0];
  return pathname === "/"
    || /^\/(?:explore|launch|notifications|profile)\/?$/.test(pathname)
    || /^\/(?:post|u|token)\/[^/?#]+\/?$/.test(pathname);
}

async function waitForReceipt(provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }, hash: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt) {
      const status = (receipt as { status?: string }).status;
      if (status !== "0x1" && status !== "0x01") throw new Error("The transaction was mined but reverted.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }
  throw new Error("The wallet submitted the transaction, but confirmation timed out. Check the explorer before retrying.");
}

function ConnectedProductAuth({ children }: { children: ReactNode }) {
  const { ready, authenticated, login: privyLogin, logout, getAccessToken } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const syncing = useRef(false);
  const refreshProfile = useCallback(async () => {
    if (!authenticated) { setProfile(null); setError(null); return; }
    if (!ready || !walletsReady || syncing.current) return;
    syncing.current = true;
    try {
      const embeddedWallet = wallets.find((item) => item.walletClientType === "privy" && item.walletIndex === 0);
      let walletCreationError: unknown = null;
      if (!embeddedWallet) {
        try { await createWallet(); }
        catch (cause) { walletCreationError = cause; }
      }
      const token = await getAccessToken();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const result = await apiRequest<{ profile: Profile }>("/api/auth/sync", { method: "POST" }, token);
          setProfile(result.profile);
          setError(null);
          return;
        } catch (cause) {
          const walletPending = cause instanceof ApiClientError && cause.code === "WALLET_NOT_READY";
          if (!walletPending || attempt === 4) throw walletCreationError || cause;
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    } catch (cause) { setProfile(null); setError(cause instanceof Error ? cause.message : "Authentication sync failed."); }
    finally { syncing.current = false; }
  }, [authenticated, ready, walletsReady, wallets, createWallet, getAccessToken]);
  useEffect(() => { if (!ready || !walletsReady) return; const timer = setTimeout(() => void refreshProfile(), 0); return () => clearTimeout(timer); }, [ready, walletsReady, refreshProfile]);
  const productLogout = useCallback(async () => {
    setProfile(null);
    setError(null);
    await logout();
  }, [logout]);
  const login = useCallback((context = "protected-action") => {
    sessionStorage.setItem("ponside:auth-return", JSON.stringify({
      path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      scrollY: window.scrollY,
      context,
      createdAt: Date.now(),
    }));
    privyLogin();
  }, [privyLogin]);
  useEffect(() => {
    if (!profile) return;
    const raw = sessionStorage.getItem("ponside:auth-return");
    if (!raw) return;
    sessionStorage.removeItem("ponside:auth-return");
    try {
      const value = JSON.parse(raw) as { path?: string; scrollY?: number; createdAt?: number };
      if (!value.path || !isSafeProductReturnPath(value.path) || !value.createdAt || Date.now() - value.createdAt > 30 * 60_000) return;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current !== value.path) { window.location.assign(value.path); return; }
      window.requestAnimationFrame(() => window.scrollTo({ top: Number(value.scrollY) || 0, behavior: "auto" }));
    } catch { /* Ignore stale or malformed browser-only return context. */ }
  }, [profile]);
  const sendTransactions = useCallback(async (transactions: PreparedTransaction[], onUpdate?: (update: WalletTransactionUpdate) => void) => {
    if (!transactions.length) throw new Error("No transaction was prepared.");
    if (transactions.some((transaction) => transaction.chainId !== robinhoodChain.id)) throw new Error("The prepared transaction targets an unsupported network.");
    const wallet = wallets.find((item) => item.walletClientType === "privy" && item.walletIndex === 0);
    if (!wallet) throw new Error("Your embedded wallet is not ready.");
    if (!profile?.walletAddress || wallet.address.toLowerCase() !== profile.walletAddress.toLowerCase()) throw new Error("The connected embedded wallet does not match your authenticated Ponside profile.");
    await wallet.switchChain(robinhoodChain.id);
    const provider = await wallet.getEthereumProvider();
    const connectedChain = await provider.request({ method: "eth_chainId" });
    if (Number.parseInt(String(connectedChain), 16) !== robinhoodChain.id) throw new Error("Switch to Robinhood Chain before continuing.");
    const hashes: `0x${string}`[] = [];
    for (const [transactionIndex, transaction] of transactions.entries()) {
      const state = { transactionIndex, transactionCount: transactions.length };
      onUpdate?.({ ...state, stage: "awaiting-signature" });
      const request = { from: wallet.address, to: transaction.to, data: transaction.data, value: transaction.value, ...(transaction.gas ? { gas: transaction.gas } : {}) };
      const hash = await provider.request({ method: "eth_sendTransaction", params: [request] }) as `0x${string}`;
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("The wallet returned an invalid transaction hash.");
      hashes.push(hash);
      onUpdate?.({ ...state, stage: "submitted", hash });
      await new Promise((resolve) => setTimeout(resolve, 0));
      onUpdate?.({ ...state, stage: "confirming", hash });
      await waitForReceipt(provider, hash);
      onUpdate?.({ ...state, stage: "confirmed", hash });
    }
    return hashes;
  }, [wallets, profile]);
  const value = useMemo<ProductAuthValue>(() => ({ configured: true, ready: ready && walletsReady, authenticated, profile, error, login, logout: productLogout, getToken: getAccessToken, refreshProfile, sendTransactions }), [ready, walletsReady, authenticated, profile, error, login, productLogout, getAccessToken, refreshProfile, sendTransactions]);
  return <ProductAuthContext.Provider value={value}>{children}</ProductAuthContext.Provider>;
}

export function ProductProviders({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <ProductAuthContext.Provider value={unavailable}>{children}</ProductAuthContext.Provider>;
  return <PrivyProvider appId={appId} config={{ loginMethods: ["twitter"], supportedChains: [robinhoodChain], defaultChain: robinhoodChain, embeddedWallets: { ethereum: { createOnLogin: "all-users" } }, appearance: { theme: "dark", accentColor: "#b4d105" } }}><ConnectedProductAuth>{children}</ConnectedProductAuth></PrivyProvider>;
}

export function useProductAuth() { return useContext(ProductAuthContext); }
