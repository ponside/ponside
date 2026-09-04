"use client";

import { useEffect, useRef, useState } from "react";
import type { Token } from "@/lib/mock-data";
import { getUser, posts } from "@/lib/mock-data";
import { Icon } from "@/components/product/icons";
import { PostCard } from "@/components/product/post-card";
import { TokenLogo } from "@/components/product/market-cards";
import { Button, FollowButton, Tabs, UserIdentity } from "@/components/product/primitives";

const tradeStates = ["Preparing", "Simulating", "Ready", "Demo transaction complete"];

function PriceChart({ token, range }: { token: Token; range: string }) {
  const paths: Record<string, string> = {
    "1H": "M0 198C42 191 58 206 91 177s59 5 91-15 45-35 83-26 50 16 90-13 54-9 90-42 61 2 95-28 67-12 110-44",
    "4H": "M0 205C44 192 62 204 98 174s58-14 95-34 55 11 94-18 65-28 104-4 57-17 96-39 71-4 110-34",
    "1D": "M0 216C48 202 62 190 108 194s43-49 92-35 66-1 102-30 57 9 104-35 71 16 112-28 62-1 92-35",
    "1W": "M0 223C49 217 72 188 115 196s56-40 101-28 47-32 92-24 67 13 109-31 75-14 113-47 56-2 70-25",
    ALL: "M0 230C42 228 64 212 101 215s56-22 94-19 60-45 104-31 61-1 98-35 70 2 115-51 55-3 68-32",
  };
  return (
    <div className="ps-price-chart">
      <div className="ps-chart-axis"><span>{token.price}</span><span>$0.00260</span><span>$0.00235</span><span>$0.00210</span></div>
      <svg viewBox="0 0 720 270" role="img" aria-label={`${token.symbol} ${range} mock price chart`} preserveAspectRatio="none">
        <defs><linearGradient id={`token-fill-${token.id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b4d105" stopOpacity=".22"/><stop offset="1" stopColor="#b4d105" stopOpacity="0"/></linearGradient></defs>
        <g className="ps-chart-grid"><path d="M0 54h720M0 108h720M0 162h720M0 216h720"/><path d="M120 0v270M240 0v270M360 0v270M480 0v270M600 0v270"/></g>
        <path className="ps-token-chart-fill" style={{ fill: `url(#token-fill-${token.id})` }} d={`${paths[range]}V270H0Z`} />
        <path className="ps-token-chart-line" d={paths[range]} />
        <circle cx="718" cy={range === "ALL" ? "38" : "34"} r="4" />
      </svg>
      <div className="ps-chart-times"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span><span>Now</span></div>
    </div>
  );
}

function TradePanel({ token, mobile = false, onClose }: { token: Token; mobile?: boolean; onClose?: () => void }) {
  const [side, setSide] = useState<"Buy" | "Sell">("Buy");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function simulate() {
    if (!amount || status >= 0) return;
    setStatus(0);
    tradeStates.slice(1).forEach((_, index) => timers.current.push(setTimeout(() => setStatus(index + 1), (index + 1) * 600)));
  }
  const receive = amount ? (Number(amount) / Number(token.price.replace("$", ""))).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0";
  return (
    <section className={`ps-trade-panel${mobile ? " is-mobile" : ""}`} aria-label={`${token.symbol} demo trade panel`}>
      {mobile && <header><strong>Trade ${token.symbol}</strong><button className="ps-icon-button" type="button" onClick={onClose} aria-label="Close trade panel"><Icon name="close" /></button></header>}
      <div className="ps-trade-tabs">{(["Buy", "Sell"] as const).map((item) => <button key={item} className={side === item ? "is-active" : ""} type="button" onClick={() => { setSide(item); setStatus(-1); }}>{item}</button>)}</div>
      <label className="ps-trade-input"><span>You pay</span><div><input inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value.replace(/[^0-9.]/g, "")); setStatus(-1); }} placeholder="0.00" /><strong>ETH</strong></div><small>Demo balance 2.84 ETH</small></label>
      <div className="ps-trade-switch"><Icon name="arrow" /></div>
      <label className="ps-trade-input"><span>You receive</span><div><output>{receive}</output><strong>{token.symbol}</strong></div><small>Estimated · Mock quote</small></label>
      <div className="ps-slippage"><span>Slippage</span><div>{["0.5%", "1%", "Auto"].map((value) => <button className={value === "Auto" ? "is-active" : ""} type="button" key={value}>{value}</button>)}</div></div>
      {status >= 0 && <div className={`ps-trade-status${status === 3 ? " is-complete" : ""}`}><span>{status === 3 ? <Icon name="check" /> : <i />}</span><div><strong>{tradeStates[status]}</strong><small>{status === 3 ? "No transaction was sent." : "Frontend simulation in progress"}</small></div></div>}
      <Button type="button" onClick={simulate} disabled={!amount || status >= 0}>{status === 3 ? "Complete" : status >= 0 ? tradeStates[status] : `${side} ${token.symbol}`}</Button>
      <p>Demo interface only. No wallet or blockchain connection.</p>
    </section>
  );
}

export function TokenDetail({ token }: { token: Token }) {
  const [range, setRange] = useState("1D");
  const [tab, setTab] = useState("Posts");
  const [mobileTrade, setMobileTrade] = useState(false);
  const creator = getUser(token.creatorId);
  const tokenPosts = posts.filter((post) => post.tokenId === token.id || post.body.includes(`$${token.symbol}`));
  return (
    <section className="ps-view ps-token-view">
      <header className="ps-token-header"><div className="ps-token-identity"><TokenLogo token={token} size="lg" /><div><span className="ps-eyebrow">{token.pairType}</span><h1>{token.name} <em>${token.symbol}</em></h1><p>{token.address.slice(0, 8)}…{token.address.slice(-6)}</p></div></div><FollowButton /><Button className="ps-mobile-trade-open" type="button" onClick={() => setMobileTrade(true)}>Trade</Button></header>
      <div className="ps-token-context"><UserIdentity user={creator} compact /><span className="ps-context-divider" /><span><small>Pair</small><strong>{token.pair}</strong></span><span><small>Phase</small><strong className="is-positive">{token.phase}</strong></span></div>
      <div className="ps-token-layout"><div className="ps-token-primary">
        <section className="ps-metric-strip"><div><span>Price</span><strong>{token.price}</strong></div><div><span>Market Cap</span><strong>{token.marketCap}</strong></div><div><span>Volume</span><strong>{token.volume}</strong></div><div><span>24h</span><strong className={token.change >= 0 ? "is-positive" : "is-negative"}>{token.change >= 0 ? "+" : ""}{token.change}%</strong></div></section>
        <section className="ps-bonding"><div><span>Bonding progress</span><strong>{token.bonding}%</strong></div><progress value={token.bonding} max="100">{token.bonding}%</progress></section>
        <section className="ps-chart-panel"><header><div><span>Price</span><strong>{token.price} <em>+{token.change}%</em></strong></div><div>{["1H", "4H", "1D", "1W", "ALL"].map((item) => <button className={range === item ? "is-active" : ""} key={item} type="button" onClick={() => setRange(item)}>{item}</button>)}</div></header><PriceChart token={token} range={range} /><p>Development mock data · not a live price feed</p></section>
        <section className="ps-token-social"><div className="ps-token-social-heading"><span className="ps-kicker">Market + conversation</span><h2>What people are saying</h2></div><Tabs tabs={["Posts", "Trades", "Holders"]} active={tab} onChange={setTab} label="Token activity" />{tab === "Posts" && <div className="ps-feed">{tokenPosts.map((post) => <PostCard key={post.id} post={post} />)}</div>}{tab === "Trades" && <div className="ps-activity-list">{["@ari bought 0.8 ETH", "@solreads bought 0.3 ETH", "@mayamoves sold 0.1 ETH"].map((item, index) => <span key={item}><i className={index === 2 ? "is-sell" : ""} /><strong>{item}</strong><small>{index + 2}m</small></span>)}</div>}{tab === "Holders" && <div className="ps-holder-list">{[creator, getUser("maya"), getUser("sol")].map((user, index) => <div key={user.id}><UserIdentity user={user} compact /><span>{["8.4%", "5.9%", "4.1%"][index]}</span></div>)}</div>}</section>
      </div><aside className="ps-token-trade"><TradePanel token={token} /></aside></div>
      {mobileTrade && <div className="ps-sheet-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setMobileTrade(false)}><TradePanel token={token} mobile onClose={() => setMobileTrade(false)} /></div>}
    </section>
  );
}
