"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Profile, SocialPost, TokenMarket } from "@/lib/domain";
import type { DiscoverySort, DiscoveryWindow } from "@/lib/discovery";
import { Icon } from "@/components/product/icons";
import { TokenCard } from "@/components/product/market-cards";
import { PostCard } from "@/components/product/post-card";
import { EmptyState, Tabs, UserIdentity } from "@/components/product/primitives";
import { useApiResource } from "@/components/product/use-resource";

type ExploreTab = "Trending" | "Tokens" | "People";

const sortLabels: Array<{ value: DiscoverySort; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];
const windows: Array<{ value: DiscoveryWindow; label: string }> = [
  { value: "all", label: "ALL" },
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
];

export function ExploreView() {
  const [tab, setTab] = useState<ExploreTab>("Trending");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DiscoverySort>("trending");
  const [window, setWindow] = useState<DiscoveryWindow>("all");
  const encoded = encodeURIComponent(query.trim());
  const tokensUrl = `/api/tokens?sort=${sort}&window=${window}${encoded ? `&q=${encoded}` : ""}`;
  const tokens = useApiResource<{ tokens: TokenMarket[] }>(tokensUrl);
  const search = useApiResource<{ profiles: Profile[] }>(encoded ? `/api/search?q=${encoded}` : null);
  const feed = useApiResource<{ posts: SocialPost[] }>("/api/feed?mode=all");
  const people = search.data?.profiles || [];
  const visibleTokens = useMemo(() => tokens.data?.tokens || [], [tokens.data]);
  const error = tokens.error || search.error;
  const heading = sort === "trending" ? "Markets moving now" : sort === "newest" ? "Newest Pons markets" : "Oldest Pons markets";
  const activityCoverage = visibleTokens[0];
  const activityLabel = activityCoverage && !activityCoverage.activityWindowComplete
    ? `${activityCoverage.activityCoverageStartedAt ? `Real Pons snapshots since ${new Date(activityCoverage.activityCoverageStartedAt).toLocaleDateString()}` : "Real Pons snapshots"} · ${window.toUpperCase()} coverage building`
    : `Real Pons market activity · ${window.toUpperCase()}`;

  function chooseSort(value: DiscoverySort) {
    setSort(value);
    if (value === "trending") setTab("Trending");
    else setTab("Tokens");
  }

  return <section className="ps-view"><header className="ps-page-header"><div><span className="ps-eyebrow">Discovery</span><h1>Explore</h1></div></header><div className="ps-explore-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, tokens, or addresses" aria-label="Search people, tokens, or addresses" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" /></button>}</div><Tabs tabs={["Trending", "Tokens", "People"]} active={tab} onChange={(value) => { const next = value as ExploreTab; setTab(next); if (next === "Trending") setSort("trending"); }} label="Explore categories" />{tab !== "People" && <div className="ps-discovery-controls"><div className="ps-filter-row" aria-label="Discovery order">{sortLabels.map((item) => <button type="button" className={sort === item.value ? "is-active" : ""} onClick={() => chooseSort(item.value)} key={item.value}>{item.label}</button>)}</div><div className="ps-filter-row" aria-label="Activity period">{windows.map((item) => <button type="button" className={window === item.value ? "is-active" : ""} onClick={() => setWindow(item.value)} key={item.value}>{item.label}</button>)}</div></div>}{error && <EmptyState title="Discovery unavailable" copy={error} />}{tab === "Trending" && !error && <div className="ps-explore-trending"><section className="ps-section-block"><header className="ps-section-title"><div><span className="ps-kicker">{activityLabel}</span><h2>{heading}</h2></div></header><div className="ps-token-stack">{visibleTokens.map((token) => <TokenCard key={token.address} token={token} />)}</div>{!tokens.loading && !visibleTokens.length && <EmptyState title="No eligible markets" copy="Verified Ponside launches and established Pons markets with reliable USD valuation will appear here." />}</section><section className="ps-section-block"><header className="ps-section-title"><div><span className="ps-kicker">People first</span><h2>Posts moving the feed</h2></div></header><div className="ps-feed">{feed.data?.posts.slice(0, 4).map((post) => <PostCard key={post.id} post={post} />)}</div>{!feed.loading && !feed.data?.posts.length && <EmptyState title="No posts yet" copy="Real community posts will appear here." />}</section></div>}{tab === "Tokens" && !error && <div className="ps-token-discovery"><div className="ps-token-stack">{visibleTokens.map((token) => <TokenCard key={token.address} token={token} />)}</div>{!tokens.loading && !visibleTokens.length && <EmptyState title="No tokens found" copy="No eligible real market matches these filters." />}</div>}{tab === "People" && <div className="ps-people-list">{people.map((profile) => <article key={profile.id}><Link href={`/u/${profile.handle}`}><UserIdentity user={profile} /></Link><p>{profile.bio || "No bio yet."}</p></article>)}{!query.trim() && <EmptyState title="Search for people" copy="Enter an X handle or display name to find a real Ponside profile." />}{query.trim() && !search.loading && !people.length && <EmptyState title="No people found" copy="No Ponside profile matches this search." />}</div>}</section>;
}
