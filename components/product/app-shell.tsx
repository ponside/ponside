"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { currentUser, getToken, getUser, launches, tokens, users } from "@/lib/mock-data";
import { Icon, type IconName } from "@/components/product/icons";
import { Avatar, Brand, Button, FollowButton, UserIdentity } from "@/components/product/primitives";
import { TokenLogo } from "@/components/product/market-cards";

const navItems: { label: string; href: string; icon: IconName }[] = [
  { label: "Home", href: "/app", icon: "home" },
  { label: "Explore", href: "/app/explore", icon: "explore" },
  { label: "Launch", href: "/app/launch", icon: "launch" },
  { label: "Notifications", href: "/app/notifications", icon: "bell" },
  { label: "Profile", href: "/app/profile", icon: "user" },
];

function Nav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav className={mobile ? "ps-mobile-nav" : "ps-nav"} aria-label={mobile ? "Mobile navigation" : "Primary navigation"}>{navItems.map((item) => {
    const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
    return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span></Link>;
  })}</nav>;
}

function SearchBox() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const people = useMemo(() => normalized ? users.filter((user) => `${user.name} ${user.handle}`.toLowerCase().includes(normalized)).slice(0, 3) : [], [normalized]);
  const foundTokens = useMemo(() => normalized ? tokens.filter((token) => `${token.name} ${token.symbol} ${token.address}`.toLowerCase().includes(normalized)).slice(0, 3) : [], [normalized]);
  const open = Boolean(normalized);
  return (
    <div className="ps-search-wrap">
      <label className="ps-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Ponside" aria-label="Search Ponside" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" /></button>}</label>
      {open && <div className="ps-search-results" role="region" aria-label="Search results">
        {people.length > 0 && <div><small>People</small>{people.map((user) => <Link key={user.id} href={`/app/u/${user.handle}`} onClick={() => setQuery("")}><UserIdentity user={user} compact /></Link>)}</div>}
        {foundTokens.length > 0 && <div><small>Tokens</small>{foundTokens.map((token) => <Link key={token.id} href={`/app/token/${token.address}`} onClick={() => setQuery("")}><TokenLogo token={token} size="sm" /><span><strong>{token.name}</strong><small>${token.symbol} · {token.address.slice(0, 7)}…</small></span><em className={token.change >= 0 ? "is-positive" : "is-negative"}>{token.change >= 0 ? "+" : ""}{token.change}%</em></Link>)}</div>}
        {!people.length && !foundTokens.length && <p className="ps-no-results">No people or tokens found.</p>}
      </div>}
    </div>
  );
}

function RightRail() {
  return <aside className="ps-right-rail"><SearchBox /><section className="ps-rail-section"><header><h2>Trending tokens</h2><Link href="/app/explore">See all</Link></header>{tokens.slice(0, 3).map((token, index) => <Link className="ps-trend-row" href={`/app/token/${token.address}`} key={token.id}><span>{index + 1}</span><TokenLogo token={token} size="sm" /><span><strong>{token.symbol}</strong><small>{token.pair} · {token.phase}</small></span><em className={token.change >= 0 ? "is-positive" : "is-negative"}>{token.change >= 0 ? "+" : ""}{token.change}%</em></Link>)}</section><section className="ps-rail-section"><header><h2>Trending people</h2></header>{users.slice(0, 3).map((user, index) => <div className="ps-person-row" key={user.id}><UserIdentity user={user} compact /><FollowButton initial={index === 1} /></div>)}</section><section className="ps-rail-section"><header><h2>Recent launches</h2></header>{launches.map((launch) => { const token = getToken(launch.tokenId); const user = getUser(launch.creatorId); return <Link className="ps-launch-row" href={`/app/token/${token.address}`} key={launch.id}><TokenLogo token={token} size="sm" /><span><strong>${token.symbol} / {token.pair}</strong><small>by @{user.handle} · {launch.createdAt}</small></span><i /></Link>; })}</section><p className="ps-mock-note">Prototype data · No live execution</p></aside>;
}

function CreatePostModal({ onClose }: { onClose: () => void }) {
  const [copy, setCopy] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  return <div className="ps-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="ps-modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><header><h2 id="create-title">Create post</h2><button className="ps-icon-button" type="button" onClick={onClose} aria-label="Close modal"><Icon name="close" /></button></header><div className="ps-modal-compose"><Avatar user={currentUser} /><textarea autoFocus value={copy} onChange={(event) => setCopy(event.target.value)} placeholder="What's moving?" rows={5} /></div><footer><div><button type="button"><Icon name="image" />Image</button><button type="button"><Icon name="coin" />Token</button><button type="button"><Icon name="chart" />Position</button></div><Button type="button" disabled={!copy.trim()} onClick={onClose}>Post</Button></footer></section></div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [createOpen, setCreateOpen] = useState(false);
  const pathname = usePathname();
  const focusRoute = pathname.startsWith("/app/token/") || pathname === "/app/launch";
  return (
    <div className={`product-shell${focusRoute ? " is-focus-route" : ""}`}>
      <header className="ps-mobile-top"><Brand /><button className="ps-icon-button" type="button" aria-label="Open profile"><Avatar user={currentUser} size="sm" /></button></header>
      <div className="ps-shell-grid">
        <aside className="ps-left-rail"><Brand /><Nav /><Button className="ps-create-button" onClick={() => setCreateOpen(true)} icon={<Icon name="plus" />}>Create post</Button><Link className="ps-sidebar-user" href="/app/profile"><UserIdentity user={currentUser} compact /><Icon name="more" /></Link></aside>
        <main className="ps-main">{children}</main>
        <RightRail />
      </div>
      <Nav mobile />
      <button className="ps-mobile-compose" type="button" onClick={() => setCreateOpen(true)} aria-label="Create post"><Icon name="plus" /></button>
      {createOpen && <CreatePostModal onClose={() => setCreateOpen(false)} />}
    </div>
  );
}
