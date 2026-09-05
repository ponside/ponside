"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { formatEther } from "viem";
import type { PreparedTransaction } from "@/lib/domain";
import { apiRequest } from "@/lib/client/api";
import { Icon } from "@/components/product/icons";
import { Avatar, Button, ServiceState } from "@/components/product/primitives";
import { useProductAuth } from "@/components/product/product-providers";
import { useApiResource } from "@/components/product/use-resource";

const NATIVE_PAIR = "0x0000000000000000000000000000000000000000";

type LaunchConfig = { id: string; supply: string; curveFeeBps: number; phantomQuote: string; graduationThreshold: string; poolFee: number; tickSpacing: number; enabled: boolean };
type LaunchPair = { address: string; symbol: string; name: string; decimals: number; label: string; logoUrl: string };
type Configuration = { factoryAddress: string; launchFee: string; maxCreatorTaxBps: number; canLaunch: boolean; pairs: LaunchPair[]; configs: LaunchConfig[]; riskNotice: string };
type Prepared = { transaction: PreparedTransaction; launchConfigId: string };

function PairLogo({ pair }: { pair: LaunchPair }) {
  const [failed, setFailed] = useState(false);
  return <span className="ps-pair-logo">{!failed && pair.logoUrl ? <Image src={pair.logoUrl} alt="" width={64} height={64} sizes="32px" quality={95} unoptimized onError={() => setFailed(true)} /> : <b>{pair.symbol.slice(0, 2)}</b>}</span>;
}

export function LaunchStudio() {
  const auth = useProductAuth();
  const config = useApiResource<Configuration>("/api/pons/config");
  const pairMenu = useRef<HTMLDetailsElement>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [pairToken, setPairToken] = useState(NATIVE_PAIR);
  const [devBuy, setDevBuy] = useState("0");
  const [creatorTaxBps, setCreatorTaxBps] = useState(0);
  const [buybackEnabled, setBuybackEnabled] = useState(false);
  const [launchConfigId, setLaunchConfigId] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tokenAddress: string; transactionHash: string } | null>(null);

  useEffect(() => {
    if (launchConfigId || !config.data?.configs[0]) return;
    const timer = setTimeout(() => setLaunchConfigId(config.data!.configs[0].id), 0);
    return () => clearTimeout(timer);
  }, [config.data, launchConfigId]);

  const selectedPair = config.data?.pairs.find((pair) => pair.address.toLowerCase() === pairToken.toLowerCase()) || config.data?.pairs[0];

  async function uploadLogo(accessToken: string | null) {
    if (!logo) return "";
    const body = new FormData();
    body.set("file", logo);
    body.set("purpose", "token-logo");
    const uploaded = await apiRequest<{ url: string }>("/api/upload", { method: "POST", body }, accessToken);
    return uploaded.url;
  }

  async function launch() {
    if (!auth.authenticated) { auth.login("launch-token"); return; }
    setStatus("Uploading metadata…");
    setError(null);
    try {
      const accessToken = await auth.getToken();
      const logoUrl = await uploadLogo(accessToken);
      setStatus("Reading current launch terms and simulating…");
      const prepared = await apiRequest<Prepared>("/api/pons/launch/prepare", {
        method: "POST",
        body: JSON.stringify({ name, symbol, description, logo: logoUrl, twitter, telegram, launchConfigId, pairToken, creatorTaxBps, buybackEnabled, devBuy: devBuy || "0", slippageBps: 100 }),
      }, accessToken);
      setStatus("Confirm the launch in your wallet…");
      const [transactionHash] = await auth.sendTransactions([prepared.transaction]);
      setStatus("Verifying the onchain launch…");
      const confirmed = await apiRequest<{ tokenAddress: string; transactionHash: string }>("/api/pons/launch/confirm", { method: "POST", body: JSON.stringify({ transactionHash }) }, accessToken);
      setResult(confirmed);
      setStatus("Launch confirmed");
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "Launch failed.");
    }
  }

  const cleanSymbol = symbol.trim().toUpperCase() || "TOKEN";
  if (!auth.authenticated) return <section className="ps-view ps-launch-view"><header className="ps-page-header"><div><span className="ps-eyebrow">Create a market</span><h1>Launch</h1></div></header><ServiceState title="Sign in to launch" copy="Ponside requires a server-verified X identity and an embedded Robinhood Chain wallet before preparing a transaction." action={<Button onClick={() => auth.login("launch-token")} disabled={!auth.configured}>Sign in with X</Button>} /></section>;
  if (config.error) return <section className="ps-view ps-launch-view"><header className="ps-page-header"><div><span className="ps-eyebrow">Create a market</span><h1>Launch</h1></div></header><ServiceState title="Launch service unavailable" copy={config.error} /></section>;

  return <section className="ps-view ps-launch-view">
    <header className="ps-page-header"><div><span className="ps-eyebrow">Create a market</span><h1>Launch</h1></div><span className="ps-demo-badge">Pons V2 · Mainnet</span></header>
    <div className="ps-launch-studio">
      <form className="ps-launch-form" onSubmit={(event) => { event.preventDefault(); void launch(); }}>
        <div className="ps-form-intro"><span>01</span><div><h2>Token details</h2><p>Metadata is pinned into the Pons V2 launch transaction.</p></div></div>
        <label className="ps-upload-field"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setLogo(event.target.files?.[0] || null)} /><span><Icon name="image" /></span><div><strong>Token image</strong><small>{logo ? logo.name : "PNG, JPEG, or WebP · max 5 MB"}</small></div><em>Choose</em></label>
        <div className="ps-field-grid"><label><span>Name</span><input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Token name" /></label><label><span>Ticker</span><input required maxLength={12} value={symbol} onChange={(event) => setSymbol(event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} placeholder="TOKEN" /></label></div>
        <label><span>Description</span><textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="What is this market about?" /></label>
        <div className="ps-field-grid ps-social-fields"><label><span>X</span><input value={twitter} onChange={(event) => setTwitter(event.target.value)} placeholder="https://x.com/handle" /></label><label><span>Telegram</span><input value={telegram} onChange={(event) => setTelegram(event.target.value)} placeholder="https://t.me/community" /></label></div>
        <div className="ps-form-intro ps-form-step"><span>02</span><div><h2>Market setup</h2><p>Choose a currently approved Pons V2 quote asset.</p></div></div>
        <div className="ps-pair-field"><span>Pair</span><details className="ps-pair-selector" ref={pairMenu}>
          <summary>{selectedPair ? <><PairLogo key={selectedPair.address} pair={selectedPair} /><strong>{selectedPair.symbol}</strong><small>{selectedPair.name}</small><Icon name="chevron" /></> : <span>Reading approved pairs…</span>}</summary>
          <div className="ps-pair-options" role="listbox" aria-label="Approved Pons V2 pair">
            {config.data?.pairs.map((pair) => <button type="button" role="option" aria-selected={pair.address.toLowerCase() === pairToken.toLowerCase()} key={pair.address} onClick={() => { setPairToken(pair.address); pairMenu.current?.removeAttribute("open"); }}><PairLogo pair={pair} /><strong>{pair.symbol}</strong><small>{pair.name}</small>{pair.address.toLowerCase() === pairToken.toLowerCase() && <Icon name="check" />}</button>)}
          </div>
        </details></div>
        <label><span>Launch configuration</span><select required value={launchConfigId} onChange={(event) => setLaunchConfigId(event.target.value)}>{config.data?.configs.map((item) => <option value={item.id} key={item.id}>Config {item.id} · {item.curveFeeBps / 100}% curve fee</option>)}</select></label>
        <label><span>Developer Buy <em>Optional</em></span><div className="ps-amount-input"><input inputMode="decimal" value={devBuy} onChange={(event) => setDevBuy(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" /><strong>{selectedPair?.symbol || "ETH"}</strong></div><small>Atomic with launch; the server calculates a slippage-protected minimum output.</small></label>
        <div className="ps-advanced"><button type="button" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}><span><strong>Advanced settings</strong><small>Creator tax and buyback</small></span><Icon name="chevron" className={advanced ? "is-open" : ""} /></button>{advanced && <div className="ps-advanced-grid"><label><span>Creator Tax (bps)</span><input type="number" min="0" max={config.data?.maxCreatorTaxBps || 0} value={creatorTaxBps} onChange={(event) => setCreatorTaxBps(Number(event.target.value))} /></label><label><span>Buyback</span><select value={buybackEnabled ? "on" : "off"} onChange={(event) => setBuybackEnabled(event.target.value === "on")}><option value="off">Off</option><option value="on">Enabled</option></select></label></div>}</div>
        {error && <p className="ps-form-error">{error}</p>}
      </form>
      <aside className="ps-launch-preview"><div className="ps-preview-window">
        <header><span>Transaction preview</span><em>Mainnet</em></header>
        <div className="ps-preview-token"><span>{cleanSymbol.slice(0, 2)}</span><div><h2>{name.trim() || "Untitled token"}</h2><p>${cleanSymbol}</p></div><i /></div>
        <p className="ps-preview-description">{description || "Your token description will appear here."}</p>
        <dl><div><dt>Pair</dt><dd>{selectedPair?.symbol || "ETH"}<small>{selectedPair?.name || "Ethereum"}</small></dd></div><div><dt>Creator</dt><dd>@{auth.profile?.handle || "authenticated"}</dd></div><div><dt>Developer Buy</dt><dd>{devBuy && devBuy !== "0" ? `${devBuy} ${selectedPair?.symbol || "ETH"}` : "None"}</dd></div><div><dt>Protocol launch fee</dt><dd>{config.data ? `${formatEther(BigInt(config.data.launchFee))} ETH` : "Reading…"}</dd></div></dl>
        {config.data && <p className="ps-risk-note">{config.data.riskNotice}</p>}
        {config.data && !config.data.canLaunch && <p className="ps-form-error">Your wallet is not currently permitted by the protocol launch gate.</p>}
        {status && <div className={`ps-trade-status${status === "Launch confirmed" ? " is-complete" : ""}`}><span>{status === "Launch confirmed" ? <Icon name="check" /> : <i />}</span><div><strong>{status}</strong><small>Terms are re-read immediately before signing.</small></div></div>}
        <Button type="button" onClick={() => void launch()} disabled={!name.trim() || !symbol.trim() || !launchConfigId || Boolean(status && status !== "Launch confirmed") || !config.data?.canLaunch}>{status || `Launch ${cleanSymbol}`}</Button>
        <small className="ps-preview-note">Your wallet signs every transaction. Ponside never receives your private key.</small>
      </div></aside>
    </div>
    {result && <div className="ps-modal-backdrop"><section className="ps-success-modal" role="dialog" aria-modal="true" aria-labelledby="launch-success"><button className="ps-icon-button" type="button" onClick={() => setResult(null)} aria-label="Close"><Icon name="close" /></button><span className="ps-success-icon"><Icon name="check" /></span><small>Onchain launch confirmed</small><h2 id="launch-success">{cleanSymbol} is live</h2><p>{result.tokenAddress.slice(0, 8)}…{result.tokenAddress.slice(-6)}</p><div><Link className="ps-button ps-button-primary" href={`/token/${result.tokenAddress}`}>View token</Link><a className="ps-button ps-button-secondary" href={`https://robinhoodchain.blockscout.com/tx/${result.transactionHash}`} target="_blank" rel="noopener noreferrer">View transaction</a></div><article className="ps-auto-post"><Avatar user={auth.profile} size="sm" /><span><strong>@{auth.profile?.handle} launched ${cleanSymbol}</strong><small>Persisted after verified factory event</small></span><i /></article></section></div>}
  </section>;
}
