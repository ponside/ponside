import Link from "next/link";
import type { Launch, Position, Token } from "@/lib/mock-data";
import { getToken, getUser } from "@/lib/mock-data";
import { Icon } from "@/components/product/icons";
import { Sparkline } from "@/components/product/primitives";

export function TokenLogo({ token, size = "md" }: { token: Token; size?: "sm" | "md" | "lg" }) {
  return <span className={`ps-token-logo ps-token-logo-${size}`}>{token.symbol.slice(0, 2)}</span>;
}

export function TokenCard({ token, compact = false }: { token: Token; compact?: boolean }) {
  return (
    <article className={`ps-token-card${compact ? " is-compact" : ""}`}>
      <Link className="ps-token-main" href={`/app/token/${token.address}`}>
        <TokenLogo token={token} />
        <span className="ps-token-name"><strong>{token.name}</strong><span>${token.symbol} · {token.pair}</span></span>
        {!compact && <Sparkline values={token.spark} negative={token.change < 0} />}
        <span className="ps-token-price"><strong>{token.price}</strong><span className={token.change >= 0 ? "is-positive" : "is-negative"}>{token.change >= 0 ? "+" : ""}{token.change}%</span></span>
      </Link>
      {!compact && <div className="ps-token-card-footer"><span className="ps-market-phase"><i />{token.phase}</span><span className="ps-pair-label">{token.pairType}</span><Link className="ps-trade-link" href={`/app/token/${token.address}`}>Trade <Icon name="arrow" /></Link></div>}
    </article>
  );
}

export function PositionCard({ position }: { position: Position }) {
  const token = getToken(position.tokenId);
  return (
    <article className="ps-position-card">
      <div className="ps-card-heading"><span><TokenLogo token={token} size="sm" /><strong>${token.symbol}</strong></span><span className="ps-positive-chip">Open</span></div>
      <div className="ps-position-metrics"><span><small>Entry</small><strong>{position.entry}</strong></span><span><small>Current</small><strong>{position.current}</strong></span><span><small>PnL</small><strong className="is-positive">+{position.pnl}%</strong></span></div>
    </article>
  );
}

export function LaunchCard({ launch }: { launch: Launch }) {
  const token = getToken(launch.tokenId);
  const creator = getUser(launch.creatorId);
  return (
    <article className="ps-launch-card">
      <div className="ps-launch-top"><TokenLogo token={token} /><span><small>Now live</small><strong>{token.name} <em>${token.symbol}</em></strong></span><span className="ps-live-dot">Live</span></div>
      <div className="ps-launch-details"><span><small>Pair</small><strong>{token.pair}</strong></span><span><small>Creator</small><strong>@{creator.handle}</strong></span><span><small>Market</small><strong>{token.phase}</strong></span></div>
      <div className="ps-launch-actions"><Link href={`/app/token/${token.address}`}>View token</Link><Link className="ps-inline-primary" href={`/app/token/${token.address}`}>Trade <Icon name="arrow" /></Link></div>
    </article>
  );
}

export function MarketVisual() {
  return (
    <figure className="ps-market-visual">
      <figcaption><span><strong>CHILL / ETH</strong><small>4H · Market structure</small></span><span className="is-positive">+18.4%</span></figcaption>
      <svg viewBox="0 0 680 250" role="img" aria-label="Mock CHILL four-hour market chart">
        <defs><linearGradient id="market-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b4d105" stopOpacity=".28"/><stop offset="1" stopColor="#b4d105" stopOpacity="0"/></linearGradient></defs>
        <g className="ps-chart-grid"><path d="M0 50h680M0 100h680M0 150h680M0 200h680"/><path d="M85 0v250M170 0v250M255 0v250M340 0v250M425 0v250M510 0v250M595 0v250"/></g>
        <path className="ps-chart-fill" d="M0 203C42 189 56 201 88 176s55-15 87-35 48-8 79-26 54 10 91-12 48-39 91-33 44 28 87 4 65-18 93-37 61 3 94-19l70-8v240H0Z"/>
        <path className="ps-chart-line" d="M0 203C42 189 56 201 88 176s55-15 87-35 48-8 79-26 54 10 91-12 48-39 91-33 44 28 87 4 65-18 93-37 61 3 94-19l70-8"/>
      </svg>
      <span className="ps-demo-label">UI mock · no live market data</span>
    </figure>
  );
}
