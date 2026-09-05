"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress, parseUnits, zeroAddress } from "viem";
import type { PreparedTransaction, TokenMarket, WalletAsset, WalletMarketReference, WalletPayload, WalletTransactionUpdate } from "@/lib/domain";
import { apiRequest } from "@/lib/client/api";
import { Icon } from "@/components/product/icons";
import { Button } from "@/components/product/primitives";
import { useProductAuth } from "@/components/product/product-providers";
import { useApiResource } from "@/components/product/use-resource";

type Action = "receive" | "send" | "swap";
type Quote = { amountIn: string; amountOut: string; minAmountOut: string; quoteSpent: string; quoteRefund: string; inputDecimals: number; outputDecimals: number; inputSymbol: string; outputSymbol: string; feeBps: number; priceImpactBps: number };
type Prepared = { quote: Quote; transactions: PreparedTransaction[]; requiresApproval: boolean };
type PreparedSend = { transaction: PreparedTransaction; asset: { name: string; symbol: string; amountFormatted: string }; estimatedGas: string; estimatedNetworkFeeWei?: string };
type Market = Pick<TokenMarket, "address" | "name" | "symbol" | "logoUrl" | "pairAddress" | "pairSymbol" | "pairDecimals" | "tokenDecimals" | "phase">;

const ETH_LOGO = "https://ethereum.org/_next/image/?q=90&url=%2F_next%2Fstatic%2Fmedia%2Feth-diamond-black.31u_5ih2w7osr.png&w=256";

function compactAmount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, 6).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function transactionLabel(update: WalletTransactionUpdate) {
  if (update.stage === "awaiting-signature") return "Awaiting authorization";
  if (update.stage === "submitted") return "Submitted";
  if (update.stage === "confirming") return "Confirming on Robinhood Chain";
  return "Confirmed";
}

function userFacingError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && Number((error as { code?: unknown }).code) === 4001) return "Signature request canceled.";
  const message = error instanceof Error ? error.message : "The wallet action failed.";
  return /reject|denied|cancel/i.test(message) ? "Signature request canceled." : message;
}

function marketFromReference(reference: WalletMarketReference): Market {
  return { address: reference.tokenAddress, name: reference.tokenName, symbol: reference.tokenSymbol, logoUrl: reference.tokenLogoUrl, pairAddress: reference.pairAddress, pairSymbol: reference.pairSymbol, pairDecimals: reference.pairDecimals, tokenDecimals: reference.tokenDecimals, phase: reference.phase };
}

function routeFor(asset: WalletAsset, market: Market): "buy" | "sell" | null {
  if (market.phase !== 0) return null;
  if (asset.kind === "native") return market.pairAddress.toLowerCase() === zeroAddress ? "buy" : null;
  if (asset.address?.toLowerCase() === market.address.toLowerCase()) return "sell";
  if (asset.address?.toLowerCase() === market.pairAddress.toLowerCase()) return "buy";
  return null;
}

function amountState(asset: WalletAsset, value: string) {
  if (!/^\d+(\.\d+)?$/.test(value)) return { valid: false, insufficient: false };
  try {
    const raw = parseUnits(value, asset.decimals);
    return { valid: raw > 0n && raw <= BigInt(asset.raw), insufficient: raw > BigInt(asset.raw) };
  } catch {
    return { valid: false, insufficient: false };
  }
}

function AssetLogo({ asset }: { asset: WalletAsset }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = asset.kind === "native" ? ETH_LOGO : asset.logoUrl;
  return <span className="ps-wallet-asset-logo">
    {logoUrl && !failed
      ? asset.kind === "native"
        ? <Image src={logoUrl} alt="" width={72} height={72} sizes="36px" quality={95} onError={() => setFailed(true)} />
        // Verified token metadata can point to arbitrary origins, so keep the original image instead of proxy-compressing it.
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={logoUrl} alt="" width="72" height="72" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      : <Image src="/icon.png" alt="" width={72} height={72} sizes="36px" quality={95} />}
  </span>;
}

export function WalletActions({ wallet, onComplete }: { wallet: WalletPayload; onComplete: () => Promise<void> }) {
  const auth = useProductAuth();
  const discovery = useApiResource<{ tokens: TokenMarket[] }>("/api/tokens?sort=trending&window=all");
  const [action, setAction] = useState<Action | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [assetKey, setAssetKey] = useState("native");
  const [marketAddress, setMarketAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [sendPrepared, setSendPrepared] = useState<PreparedSend | null>(null);
  const [swapReview, setSwapReview] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const assets = useMemo(() => [wallet.native, ...(wallet.portfolio || [])], [wallet]);
  const selectedAsset = assets.find((asset) => (asset.address || "native") === assetKey) || assets[0];
  const markets = useMemo(() => {
    const values = new Map<string, Market>();
    for (const token of discovery.data?.tokens || []) values.set(token.address.toLowerCase(), token);
    for (const asset of wallet.portfolio || []) if (asset.market) values.set(asset.market.tokenAddress.toLowerCase(), marketFromReference(asset.market));
    return [...values.values()];
  }, [discovery.data, wallet.portfolio]);
  const routes = useMemo(() => markets.filter((market) => routeFor(selectedAsset, market)), [markets, selectedAsset]);
  const selectedMarket = routes.find((market) => market.address === marketAddress) || routes[0] || null;
  const side = selectedMarket ? routeFor(selectedAsset, selectedMarket) : null;
  const destination = selectedMarket && side ? (side === "buy" ? selectedMarket.symbol : selectedMarket.pairSymbol) : "—";
  const destinationKey = selectedMarket && side ? (side === "buy" ? selectedMarket.address.toLowerCase() : selectedMarket.pairAddress.toLowerCase() === zeroAddress ? "native" : selectedMarket.pairAddress.toLowerCase()) : null;
  const reverseAsset = destinationKey ? assets.find((asset) => (asset.address || "native").toLowerCase() === destinationKey) : undefined;
  const sendAmount = amountState(selectedAsset, amount);
  const swapAmount = amountState(selectedAsset, amount);
  const recipientValid = isAddress(recipient) && recipient.toLowerCase() !== zeroAddress;

  useEffect(() => {
    if (action !== "receive") return;
    let active = true;
    void QRCode.toDataURL(wallet.walletAddress, { width: 360, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0F1011", light: "#F4F5F5" } }).then((value) => { if (active) setQrUrl(value); });
    return () => { active = false; };
  }, [action, wallet.walletAddress]);

  useEffect(() => {
    if (action !== "swap" || !selectedMarket || !side || !swapAmount.valid) return;
    const timer = setTimeout(async () => {
      try {
        setError("");
        const token = await auth.getToken();
        const result = await apiRequest<Quote>("/api/pons/quote", { method: "POST", body: JSON.stringify({ tokenAddress: selectedMarket.address, side, amount, slippageBps }) }, token);
        setQuote(result);
      } catch (cause) { setQuote(null); setError(userFacingError(cause)); }
    }, 350);
    return () => clearTimeout(timer);
  }, [action, amount, selectedMarket, side, slippageBps, auth, swapAmount.valid]);

  useEffect(() => {
    if (!action) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !status) setAction(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [action, status]);

  function open(next: Action) {
    setAction(next); setStatus(""); setError(""); setAmount(""); setRecipient(""); setQuote(null); setCopied(false); setSendPrepared(null); setSwapReview(false);
  }

  function clearReview() { setSendPrepared(null); setSwapReview(false); setError(""); }
  function onTransaction(update: WalletTransactionUpdate) { setStatus(transactionLabel(update)); }

  async function copyAddress() {
    try { await navigator.clipboard.writeText(wallet.walletAddress); setCopied(true); }
    catch { setError("Clipboard access is unavailable. Select and copy the address manually."); }
  }

  async function prepareSend() {
    if (!sendAmount.valid || !recipientValid) return;
    try {
      setError(""); setStatus("Checking balance and network fee");
      const token = await auth.getToken();
      const prepared = await apiRequest<PreparedSend>("/api/wallet/send/prepare", { method: "POST", body: JSON.stringify({ asset: selectedAsset.address || "native", amount, recipient }) }, token);
      setSendPrepared(prepared); setStatus("");
    } catch (cause) { setStatus(""); setError(userFacingError(cause)); }
  }

  async function send() {
    if (!sendPrepared) return;
    try {
      setError("");
      await auth.sendTransactions([sendPrepared.transaction], onTransaction);
      setStatus("Confirmed"); setAmount(""); setRecipient(""); setSendPrepared(null); await onComplete();
    } catch (cause) { setStatus(""); setError(userFacingError(cause)); }
  }

  async function swap() {
    if (!selectedMarket || !side || !quote) return;
    const body = JSON.stringify({ tokenAddress: selectedMarket.address, side, amount, slippageBps });
    try {
      setError(""); setStatus("Preparing verified route");
      const token = await auth.getToken();
      let prepared = await apiRequest<Prepared>("/api/pons/trade/prepare", { method: "POST", body }, token);
      if (prepared.requiresApproval) {
        await auth.sendTransactions([prepared.transactions[0]], onTransaction);
        setStatus("Refreshing approval");
        prepared = await apiRequest<Prepared>("/api/pons/trade/prepare", { method: "POST", body }, token);
        if (prepared.requiresApproval) throw new Error("The exact token approval is not visible onchain yet. Please retry shortly.");
      }
      await auth.sendTransactions(prepared.transactions, onTransaction);
      setStatus("Confirmed"); setAmount(""); setQuote(null); setSwapReview(false); await onComplete();
    } catch (cause) { setStatus(""); setError(userFacingError(cause)); }
  }

  function reverseSwap() {
    if (!reverseAsset || !selectedMarket) return;
    setAssetKey(reverseAsset.address || "native"); setMarketAddress(selectedMarket.address); setAmount(""); setQuote(null); setSwapReview(false); setError("");
  }

  const pending = Boolean(status && status !== "Confirmed");
  return <>
    <article className="ps-wallet-overview">
      <header><div><small>Embedded wallet</small><strong>Robinhood Chain</strong></div><code title={wallet.walletAddress}>{wallet.walletAddress}</code></header>
      <div className="ps-wallet-value"><span><small>Portfolio value</small><strong>USD pricing unavailable</strong></span><small>Only authoritative USD values are shown.</small></div>
      <div className="ps-wallet-assets" aria-label="Wallet assets">
        {assets.map((asset) => {
          const content = <><AssetLogo asset={asset} /><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span><span><strong>{compactAmount(asset.formatted)}</strong><small>{asset.symbol}</small></span></>;
          return asset.market ? <Link href={`/token/${asset.address}`} key={asset.address || "native"}>{content}</Link> : <div key={asset.address || "native"}>{content}</div>;
        })}
      </div>
      <div className="ps-wallet-actions" aria-label="Wallet actions">
        <Button type="button" tone="secondary" onClick={() => open("swap")}><Icon name="swap" />Swap</Button>
        <Button type="button" tone="secondary" onClick={() => open("send")}><Icon name="send" />Send</Button>
        <Button type="button" tone="secondary" onClick={() => open("receive")}><Icon name="receive" />Receive</Button>
      </div>
    </article>
    {action && <div className="ps-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !pending) setAction(null); }}>
      <section className="ps-modal ps-wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-action-title">
        <header><div><small>Robinhood Chain</small><h2 id="wallet-action-title">{action[0].toUpperCase() + action.slice(1)}</h2></div><button className="ps-icon-button" type="button" onClick={() => setAction(null)} disabled={pending} aria-label="Close"><Icon name="close" /></button></header>
        {action === "receive" && <div className="ps-wallet-modal-body ps-receive-body">
          {qrUrl && <Image src={qrUrl} alt="QR code for the embedded wallet address" width={210} height={210} unoptimized />}
          <div><small>Receive on</small><strong>Robinhood Chain</strong></div>
          <code>{wallet.walletAddress}</code>
          <p>Send only Robinhood Chain assets to this embedded wallet.</p>
          <Button type="button" tone="secondary" onClick={() => void copyAddress()}><Icon name={copied ? "check" : "copy"} />{copied ? "Address copied" : "Copy Address"}</Button>
        </div>}
        {action === "send" && <div className="ps-wallet-modal-body">
          {!sendPrepared ? <>
            <label><span>Asset</span><select value={assetKey} onChange={(event) => { setAssetKey(event.target.value); setAmount(""); clearReview(); }} disabled={pending}>{assets.map((asset) => <option value={asset.address || "native"} key={asset.address || "native"}>{asset.symbol} · {asset.name}</option>)}</select></label>
            <label><span>Recipient</span><input value={recipient} onChange={(event) => { setRecipient(event.target.value.trim()); clearReview(); }} placeholder="0x…" autoComplete="off" spellCheck={false} disabled={pending} /><small>{recipient && !recipientValid ? "Enter a valid non-zero EVM address." : "Robinhood Chain address"}</small></label>
            <label><span>Amount</span><div className="ps-wallet-amount"><input inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value.replace(/[^0-9.]/g, "")); clearReview(); }} placeholder="0.00" disabled={pending} /><button type="button" onClick={() => { setAmount(selectedAsset.formatted); clearReview(); }} disabled={pending}>Max</button></div><small className={sendAmount.insufficient ? "is-error" : ""}>Available {compactAmount(selectedAsset.formatted)} {selectedAsset.symbol}{sendAmount.insufficient ? " · Insufficient balance" : ""}</small></label>
            <Button type="button" onClick={() => void prepareSend()} disabled={pending || !sendAmount.valid || !recipientValid}>Review send</Button>
          </> : <div className="ps-wallet-review">
            <span className="ps-wallet-review-icon"><Icon name="send" /></span><div><small>You send</small><strong>{compactAmount(sendPrepared.asset.amountFormatted)} {sendPrepared.asset.symbol}</strong></div>
            <dl><div><dt>To</dt><dd title={recipient}>{recipient.slice(0, 10)}…{recipient.slice(-8)}</dd></div><div><dt>Network</dt><dd>Robinhood Chain</dd></div><div><dt>Estimated network fee</dt><dd>{sendPrepared.estimatedNetworkFeeWei ? `${compactAmount(formatUnits(BigInt(sendPrepared.estimatedNetworkFeeWei), 18))} ETH` : "Shown by wallet"}</dd></div></dl>
            <p>The final network fee is confirmed by your embedded wallet before authorization.</p>
            <Button type="button" onClick={() => void send()} disabled={pending}>Authorize send</Button><button className="ps-wallet-edit" type="button" onClick={() => setSendPrepared(null)} disabled={pending}>Edit details</button>
          </div>}
        </div>}
        {action === "swap" && <div className="ps-wallet-modal-body">
          {!swapReview ? <>
            <label><span>From</span><select value={assetKey} onChange={(event) => { setAssetKey(event.target.value); setMarketAddress(""); setAmount(""); setQuote(null); setSwapReview(false); }} disabled={pending}>{assets.map((asset) => <option value={asset.address || "native"} key={asset.address || "native"}>{asset.symbol} · {asset.name}</option>)}</select></label>
            <label className="ps-wallet-swap-amount"><span>Amount</span><div className="ps-wallet-amount"><input inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value.replace(/[^0-9.]/g, "")); setQuote(null); setSwapReview(false); }} placeholder="0.00" disabled={pending || !selectedMarket} /><button type="button" onClick={() => { setAmount(selectedAsset.formatted); setQuote(null); setSwapReview(false); }} disabled={pending || !selectedMarket}>Max</button></div><small className={swapAmount.insufficient ? "is-error" : ""}>Balance {compactAmount(selectedAsset.formatted)} {selectedAsset.symbol}{swapAmount.insufficient ? " · Insufficient" : ""}</small></label>
            <button className="ps-wallet-direction" type="button" onClick={reverseSwap} disabled={!reverseAsset || pending} aria-label="Reverse swap direction" title={reverseAsset ? "Reverse swap direction" : "The receive asset is not currently available in this wallet"}><Icon name="swap" /></button>
            <label><span>To</span><select value={selectedMarket?.address || ""} onChange={(event) => { setMarketAddress(event.target.value); setQuote(null); setSwapReview(false); }} disabled={pending || !routes.length}>{routes.length ? routes.map((market) => <option value={market.address} key={market.address}>{routeFor(selectedAsset, market) === "buy" ? `${market.symbol} · ${market.name}` : market.pairSymbol}</option>) : <option value="">No executable Pons route</option>}</select></label>
            <div className="ps-wallet-quote"><span><small>Estimated receive</small><strong>{quote ? `${compactAmount(formatUnits(BigInt(quote.amountOut), quote.outputDecimals))} ${destination}` : "—"}</strong></span><span><small>Minimum received</small><strong>{quote ? `${compactAmount(formatUnits(BigInt(quote.minAmountOut), quote.outputDecimals))} ${destination}` : "—"}</strong></span><span><small>Price impact</small><strong>{quote ? `${(quote.priceImpactBps / 100).toFixed(2)}%` : "—"}</strong></span><span><small>Fee</small><strong>{quote ? `${(quote.feeBps / 100).toFixed(2)}%` : "—"}</strong></span></div>
            <div className="ps-wallet-slippage"><span>Slippage</span>{[[50, "0.5%"], [100, "1%"], [200, "2%"]].map(([value, label]) => <button type="button" className={slippageBps === value ? "is-active" : ""} onClick={() => { setSlippageBps(Number(value)); setQuote(null); setSwapReview(false); }} key={value}>{label}</button>)}</div>
            <Button type="button" onClick={() => setSwapReview(true)} disabled={pending || !quote || !selectedMarket || !swapAmount.valid}>Review swap</Button>
            {!routes.length && <p className="ps-wallet-unavailable">No executable Pons curve route is available for this asset.</p>}
          </> : selectedMarket && quote && <div className="ps-wallet-review">
            <span className="ps-wallet-review-icon"><Icon name="swap" /></span><div><small>You swap</small><strong>{compactAmount(amount)} {selectedAsset.symbol} → {compactAmount(formatUnits(BigInt(quote.amountOut), quote.outputDecimals))} {destination}</strong></div>
            <dl><div><dt>Minimum received</dt><dd>{compactAmount(formatUnits(BigInt(quote.minAmountOut), quote.outputDecimals))} {destination}</dd></div><div><dt>Price impact</dt><dd>{(quote.priceImpactBps / 100).toFixed(2)}%</dd></div><div><dt>Fee</dt><dd>{(quote.feeBps / 100).toFixed(2)}%</dd></div><div><dt>Slippage</dt><dd>{(slippageBps / 100).toFixed(2)}%</dd></div></dl>
            <p>This route will be re-simulated against current Pons curve state before authorization.</p>
            <Button type="button" onClick={() => void swap()} disabled={pending}>Authorize swap</Button><button className="ps-wallet-edit" type="button" onClick={() => setSwapReview(false)} disabled={pending}>Edit swap</button>
          </div>}
        </div>}
        {(status || error) && <footer className="ps-wallet-state" aria-live="polite"><span className={status === "Confirmed" ? "is-complete" : ""}>{status === "Confirmed" ? <Icon name="check" /> : status ? <i /> : <Icon name="close" />}</span><div><strong>{status || "Action failed"}</strong><small>{error || (status === "Confirmed" ? "Verified successful receipt on Robinhood Chain" : "Keep this sheet open while the transaction completes")}</small></div></footer>}
      </section>
    </div>}
  </>;
}
