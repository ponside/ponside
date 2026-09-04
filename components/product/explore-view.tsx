"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { posts, tokens, users } from "@/lib/mock-data";
import { Icon } from "@/components/product/icons";
import { PostCard } from "@/components/product/post-card";
import { FollowButton, Tabs, UserIdentity } from "@/components/product/primitives";
import { TokenLogo } from "@/components/product/market-cards";

type ExploreTab = "Trending" | "Tokens" | "People";

export function ExploreView() {
  const [tab, setTab] = useState<ExploreTab>("Trending");
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const visibleTokens = useMemo(() => tokens.filter((token) => {
    const matchesFilter = filter === "All" || (filter === "ETH" ? token.pair === "ETH" : token.pairType === "Stock Pair");
    return matchesFilter && `${token.name} ${token.symbol} ${token.address}`.toLowerCase().includes(normalized);
  }), [filter, normalized]);
  const visiblePeople = useMemo(() => users.filter((user) => `${user.name} ${user.handle} ${user.bio}`.toLowerCase().includes(normalized)), [normalized]);

  return (
    <section className="ps-view">
      <header className="ps-page-header"><div><span className="ps-eyebrow">Discovery</span><h1>Explore</h1></div></header>
      <div className="ps-explore-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people tokens or addresses" aria-label="Search people, tokens, or addresses" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" /></button>}</div>
      <Tabs tabs={["Trending", "Tokens", "People"]} active={tab} onChange={(value) => setTab(value as ExploreTab)} label="Explore categories" />

      {tab === "Trending" && <div className="ps-explore-trending">
        <section className="ps-section-block"><header className="ps-section-title"><div><span className="ps-kicker">Happening now</span><h2>Markets in conversation</h2></div><button type="button" onClick={() => setTab("Tokens")}>View tokens <Icon name="arrow" /></button></header><div className="ps-featured-tokens">{tokens.slice(0, 2).map((token) => <article key={token.id}><div><TokenLogo token={token} /><span><strong>{token.name}</strong><small>${token.symbol} · {token.pair}</small></span></div><span className={token.change >= 0 ? "is-positive" : "is-negative"}>{token.change >= 0 ? "+" : ""}{token.change}%</span><svg viewBox="0 0 180 54" aria-hidden="true"><path d={token.change >= 0 ? "M0 45C22 42 25 34 48 36s26-16 49-12 25 12 42 2 24-13 41-20" : "M0 10c21 3 29 8 43 7s29 17 47 13 24 11 40 8 25 11 50 9"} /></svg></article>)}</div></section>
        <section className="ps-section-block"><header className="ps-section-title"><div><span className="ps-kicker">People first</span><h2>Posts moving the feed</h2></div></header><div className="ps-feed">{posts.slice(1, 4).map((post) => <PostCard key={post.id} post={post} />)}</div></section>
      </div>}

      {tab === "Tokens" && <div className="ps-token-discovery"><div className="ps-filter-row" aria-label="Token pair filter">{["All", "ETH", "Stocks"].map((item) => <button key={item} className={filter === item ? "is-active" : ""} type="button" onClick={() => setFilter(item)}>{item}</button>)}</div><div className="ps-token-table"><header><span>Token</span><span>Price</span><span>24h</span><span>Volume</span><span>Phase</span><span /></header>{visibleTokens.map((token) => <article key={token.id}><div><TokenLogo token={token} /><span><strong>{token.name}</strong><small>${token.symbol} · {token.pair}</small></span></div><strong>{token.price}</strong><strong className={token.change >= 0 ? "is-positive" : "is-negative"}>{token.change >= 0 ? "+" : ""}{token.change}%</strong><span>{token.volume}</span><span><i />{token.phase}</span><Link href={`/app/token/${token.address}`}>Trade <Icon name="arrow" /></Link></article>)}</div>{visibleTokens.length === 0 && <p className="ps-list-empty">No tokens match this search.</p>}</div>}

      {tab === "People" && <div className="ps-people-list">{visiblePeople.map((user, index) => <article key={user.id}><UserIdentity user={user} /><p>{user.bio}</p><div><span><strong>{user.followers}</strong> followers</span><span><strong>{user.following}</strong> following</span></div><FollowButton initial={index === 2} /></article>)}{visiblePeople.length === 0 && <p className="ps-list-empty">No people match this search.</p>}</div>}
    </section>
  );
}
