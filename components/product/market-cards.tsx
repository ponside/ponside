"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatUnits } from "viem";
import type { TokenMarket } from "@/lib/domain";
import { Icon } from "@/components/product/icons";

function compact(raw: string | null, decimals: number) {
  if (raw === null) return "Unavailable";
  const value = Number(formatUnits(BigInt(raw), decimals));
  if (!Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: value < 1 ? 6 : 2 }).format(value);
}

export function TokenLogo({ token, size = "md" }: { token: TokenMarket; size?: "sm" | "md" | "lg" }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showLogo = Boolean(token.logoUrl && failedUrl !== token.logoUrl);
  const pixels = { sm: 68, md: 88, lg: 132 }[size];
  return <span className={`ps-token-logo ps-token-logo-${size}`}>
    {showLogo && token.logoUrl
      // Metadata URLs are arbitrary verified onchain values, so the original asset is rendered without lossy proxy recompression.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={token.logoUrl} alt="" width={pixels} height={pixels} loading="lazy" decoding="async" onError={() => setFailedUrl(token.logoUrl)} />
      : <Image src="/icon.png" alt="" width={pixels} height={pixels} quality={95} />}
  </span>;
}

export function TokenCard({ token, compact: isCompact = false }: { token: TokenMarket; compact?: boolean }) {
  const change = token.changeBps === null ? null : token.changeBps / 100;
  return <article className={`ps-token-card${isCompact ? " is-compact" : ""}`}><Link className="ps-token-main" href={`/token/${token.address}`}><TokenLogo token={token} /><span className="ps-token-name"><strong>{token.name}</strong><span>${token.symbol} · {token.pairSymbol}</span></span><span className="ps-token-price"><strong>{token.marketCapUsdE18 ? `$${compact(token.marketCapUsdE18, 18)} MC` : `${compact(token.priceRaw, 18)} ${token.pairSymbol}`}</strong><span className={change === null ? "" : change >= 0 ? "is-positive" : "is-negative"}>{change === null ? `${token.activityWindow.toUpperCase()} change unavailable` : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}</span></span></Link>{!isCompact && <div className="ps-token-card-footer"><span className="ps-market-phase"><i />{token.phaseLabel}</span><span className="ps-pair-label">{token.isPonsideLaunch ? "Ponside launch" : "Established Pons market"}</span><Link className="ps-trade-link" href={`/token/${token.address}`}>View <Icon name="arrow" /></Link></div>}</article>;
}

export function LaunchCard({ token }: { token: TokenMarket }) {
  return <article className="ps-launch-card"><div className="ps-launch-top"><TokenLogo token={token} /><span><small>Indexed launch</small><strong>{token.name} <em>${token.symbol}</em></strong></span><span className="ps-live-dot">{token.phaseLabel}</span></div><div className="ps-launch-details"><span><small>Pair</small><strong>{token.pairSymbol}</strong></span><span><small>Creator</small><strong>{token.creator ? `@${token.creator.handle}` : "Onchain wallet"}</strong></span><span><small>Market</small><strong>{token.phaseLabel}</strong></span></div><div className="ps-launch-actions"><Link href={`/token/${token.address}`}>View token</Link><Link className="ps-inline-primary" href={`/token/${token.address}`}>Trade <Icon name="arrow" /></Link></div></article>;
}

export { compact as formatTokenAmount };
