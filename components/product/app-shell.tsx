"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import type { Profile, TokenMarket } from "@/lib/domain";
import { apiRequest } from "@/lib/client/api";
import { Icon, type IconName } from "@/components/product/icons";
import { Avatar, Brand, Button, FollowButton, ServiceState, UserIdentity } from "@/components/product/primitives";
import { TokenLogo } from "@/components/product/market-cards";
import { useProductAuth } from "@/components/product/product-providers";
import { useApiResource } from "@/components/product/use-resource";

const navItems: { label: string; href: string; icon: IconName }[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Explore", href: "/explore", icon: "explore" },
  { label: "Launch", href: "/launch", icon: "launch" },
  { label: "Notifications", href: "/notifications", icon: "bell" },
  { label: "Profile", href: "/profile", icon: "user" },
];

function Nav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav className={mobile ? "ps-mobile-nav" : "ps-nav"} aria-label={mobile ? "Mobile navigation" : "Primary navigation"}>{navItems.map((item) => {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span></Link>;
  })}</nav>;
}

function SearchBox() {
  const [query, setQuery] = useState("");
  const normalized = query.trim();
  const { data, loading } = useApiResource<{ profiles: Profile[]; tokens: TokenMarket[] }>(normalized ? `/api/search?q=${encodeURIComponent(normalized)}` : null);
  const people = data?.profiles || [];
  const tokens = data?.tokens || [];
  return <div className="ps-search-wrap">
    <label className="ps-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Ponside" aria-label="Search Ponside" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="close" /></button>}</label>
    {normalized && <div className="ps-search-results" role="region" aria-label="Search results">
      {people.length > 0 && <div><small>People</small>{people.slice(0, 3).map((profile) => <Link key={profile.id} href={`/u/${profile.handle}`} onClick={() => setQuery("")}><UserIdentity user={profile} compact /></Link>)}</div>}
      {tokens.length > 0 && <div><small>Tokens</small>{tokens.slice(0, 3).map((token) => <Link key={token.address} href={`/token/${token.address}`} onClick={() => setQuery("")}><TokenLogo token={token} size="sm" /><span><strong>{token.name}</strong><small>${token.symbol} · {token.address.slice(0, 7)}…</small></span></Link>)}</div>}
      {!loading && !people.length && !tokens.length && <p className="ps-no-results">No people or tokens found.</p>}
    </div>}
  </div>;
}

function RightRail() {
  const { data: tokenData } = useApiResource<{ tokens: TokenMarket[] }>("/api/tokens?sort=trending&window=24h");
  const { data: recentData } = useApiResource<{ tokens: TokenMarket[] }>("/api/tokens?sort=newest&window=all");
  const { data: peopleData } = useApiResource<{ profiles: Profile[] }>("/api/trending/people");
  const tokens = tokenData?.tokens || [];
  const recent = recentData?.tokens || [];
  const people = peopleData?.profiles || [];
  return <aside className="ps-right-rail"><SearchBox />
    <section className="ps-rail-section"><header><h2>Trending tokens</h2><Link href="/explore">See all</Link></header>{tokens.slice(0, 3).map((token, index) => <Link className="ps-trend-row" href={`/token/${token.address}`} key={token.address}><span>{index + 1}</span><TokenLogo token={token} size="sm" /><span><strong>{token.symbol}</strong><small>{token.pairSymbol} · {token.phaseLabel}</small></span><em className={token.changeBps === null ? "" : token.changeBps >= 0 ? "is-positive" : "is-negative"}>{token.changeBps === null ? "—" : `${token.changeBps >= 0 ? "+" : ""}${(token.changeBps / 100).toFixed(2)}%`}</em></Link>)}</section>
    <section className="ps-rail-section"><header><h2>Trending people</h2></header>{people.slice(0, 3).map((profile) => <div className="ps-person-row" key={profile.id}><Link href={`/u/${profile.handle}`}><UserIdentity user={profile} compact /></Link>{!profile.isOwn && <FollowButton profileId={profile.id} initial={profile.isFollowing} />}</div>)}</section>
    <section className="ps-rail-section"><header><h2>Recent launches</h2></header>{recent.slice(0, 3).map((token) => <Link className="ps-launch-row" href={`/token/${token.address}`} key={token.address}><TokenLogo token={token} size="sm" /><span><strong>${token.symbol} / {token.pairSymbol}</strong><small>{new Date(token.launchTimestamp).toLocaleDateString()}</small></span><i /></Link>)}</section>
  </aside>;
}

function CreatePostModal({ onClose }: { onClose: () => void }) {
  const auth = useProductAuth();
  const [copy, setCopy] = useState("");
  const [showTokenField, setShowTokenField] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("");
  const [media, setMedia] = useState<{ url: string; storagePath: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const token = await auth.getToken();
      const form = new FormData(); form.set("file", file); form.set("purpose", "post-media");
      setMedia(await apiRequest<{ url: string; storagePath: string; type: string }>("/api/upload", { method: "POST", body: form }, token));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Image upload failed."); }
    finally { setBusy(false); event.target.value = ""; }
  }
  async function submit() {
    if (!auth.authenticated) { auth.login("create-post"); return; }
    setBusy(true); setError(null);
    try {
      const token = await auth.getToken();
      await apiRequest("/api/posts", { method: "POST", body: JSON.stringify({ content: copy, tokenAddress: tokenAddress.trim() || null, media: media ? [media] : [] }) }, token);
      onClose(); window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Post creation failed."); }
    finally { setBusy(false); }
  }
  if (!auth.authenticated) return <div className="ps-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="ps-modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><header><h2 id="create-title">Create post</h2><button className="ps-icon-button" type="button" onClick={onClose} aria-label="Close modal"><Icon name="close" /></button></header><ServiceState title="Sign in to post" copy="Connect with X to create your Ponside profile and embedded wallet." action={<Button type="button" onClick={() => auth.login("create-post")}>Sign in with X</Button>} /></section></div>;
  return <div className="ps-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="ps-modal" role="dialog" aria-modal="true" aria-labelledby="create-title"><header><h2 id="create-title">Create post</h2><button className="ps-icon-button" type="button" onClick={onClose} aria-label="Close modal"><Icon name="close" /></button></header><div className="ps-modal-compose"><Avatar user={auth.profile} /><div className="ps-modal-fields"><textarea autoFocus value={copy} onChange={(event) => setCopy(event.target.value)} placeholder="What's moving?" rows={5} maxLength={2000} />{showTokenField && <input value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)} placeholder="Indexed Pons V2 token address" aria-label="Token address" />}{media && <small>Image ready</small>}{error && <p className="ps-form-error">{error}</p>}</div></div><footer><div><label><Icon name="image" />Image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => void upload(event)} /></label><button type="button" onClick={() => { setShowTokenField((value) => !value); setTokenAddress(""); }}><Icon name="coin" />Token</button>{media && <button type="button" onClick={() => setMedia(null)}><Icon name="close" />Remove</button>}</div><Button type="button" disabled={(!copy.trim() && !media) || busy} onClick={() => void submit()}>{busy ? "Saving…" : "Post"}</Button></footer></section></div>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useProductAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const pathname = usePathname();
  const focusRoute = pathname.startsWith("/token/") || pathname === "/launch";
  return <div className={`product-shell${focusRoute ? " is-focus-route" : ""}`}>
    <header className="ps-mobile-top"><Brand /><Link href="/profile" aria-label="Open profile"><Avatar user={auth.profile} size="sm" /></Link></header>
    <div className="ps-shell-grid"><aside className="ps-left-rail"><Brand /><Nav /><Button className="ps-create-button" onClick={() => setCreateOpen(true)} icon={<Icon name="plus" />}>Create post</Button><Link className="ps-sidebar-user" href="/profile">{auth.profile ? <UserIdentity user={auth.profile} compact /> : <span className="ps-identity"><Avatar user={null} size="sm" /><span className="ps-identity-copy"><span className="ps-name-row"><strong>{auth.authenticated ? "Loading profile" : "Sign in"}</strong></span><span>{auth.authenticated ? "Verifying account" : "with X"}</span></span></span>}<Icon name="more" /></Link></aside><main className="ps-main">{children}</main><RightRail /></div>
    <Nav mobile /><button className="ps-mobile-compose" type="button" onClick={() => setCreateOpen(true)} aria-label="Create post"><Icon name="plus" /></button>{createOpen && <CreatePostModal onClose={() => setCreateOpen(false)} />}
  </div>;
}
