"use client";

import { useState } from "react";
import type { Profile, SocialPost, TokenMarket, WalletPayload } from "@/lib/domain";
import { apiRequest } from "@/lib/client/api";
import { Icon } from "@/components/product/icons";
import { LaunchCard } from "@/components/product/market-cards";
import { PostCard } from "@/components/product/post-card";
import { Avatar, Button, EmptyState, FollowButton, ServiceState, Tabs } from "@/components/product/primitives";
import { useProductAuth } from "@/components/product/product-providers";
import { useApiResource } from "@/components/product/use-resource";
import { WalletActions } from "@/components/product/wallet-actions";

type ProfilePayload = { profile: Profile; posts: SocialPost[]; replies?: SocialPost[]; launches: TokenMarket[] | null; launchesError: string | null };
type ProfileTab = "Posts" | "Replies" | "Launches" | "Positions";

export function ProfileView({ handle, own = false }: { handle?: string; own?: boolean }) {
  const auth = useProductAuth();
  const [tab, setTab] = useState<ProfileTab>("Posts");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const path = own ? (auth.authenticated ? "/api/profile" : null) : `/api/profiles/${encodeURIComponent(handle || "")}`;
  const profile = useApiResource<ProfilePayload>(path, { requiresAuth: own });
  const balances = useApiResource<WalletPayload>(own && auth.authenticated ? "/api/wallet/balances?portfolio=1" : null, { requiresAuth: true });

  function startEditing() {
    if (!profile.data) return;
    setName(profile.data.profile.name);
    setBio(profile.data.profile.bio);
    setEditing(true);
  }

  async function save() {
    const token = await auth.getToken();
    await apiRequest("/api/profile", { method: "PATCH", body: JSON.stringify({ displayName: name, bio }) }, token);
    setEditing(false);
    await profile.refresh();
  }

  if (own && !auth.authenticated) return <section className="ps-view"><ServiceState title="Sign in to view your profile" copy="Ponside uses your verified X identity and creates an embedded Robinhood Chain wallet." action={<Button onClick={() => auth.login("own-profile")} disabled={!auth.configured}>Sign in with X</Button>} /></section>;
  if (profile.loading) return <section className="ps-view"><div className="ps-loading-list"><i /><i /><i /></div></section>;
  if (profile.error || !profile.data) return <section className="ps-view"><ServiceState title="Profile unavailable" copy={profile.error || "This profile could not be loaded."} /></section>;

  const user = profile.data.profile;
  const launches = profile.data.launches || [];
  const items = tab === "Replies" ? (profile.data.replies || []) : profile.data.posts;
  return (
    <section className="ps-view">
      <header className="ps-profile-cover"><span className="ps-profile-signal" /><div className="ps-profile-header"><Avatar user={user} size="xl" /><div className="ps-profile-actions">{own ? <><Button tone="secondary" type="button" onClick={() => editing ? setEditing(false) : startEditing()}>Edit profile</Button><Button tone="quiet" type="button" onClick={() => void auth.logout()}>Log out</Button></> : !user.isOwn && <FollowButton profileId={user.id} initial={user.isFollowing} />}</div></div></header>
      <div className="ps-profile-copy"><h1>{user.name}</h1><span>@{user.handle}</span><p>{user.bio || "No bio yet."}</p><div className="ps-profile-meta"><span title={user.walletAddress || undefined}><Icon name="wallet" /><code>{user.walletAddress || "Wallet unavailable"}</code></span></div><div className="ps-profile-stats"><span><strong>{user.following}</strong> Following</span><span><strong>{user.followers}</strong> Followers</span></div></div>
      {editing && <form className="ps-profile-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}><label><span>Display name</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label><label><span>Bio</span><textarea value={bio} maxLength={300} onChange={(event) => setBio(event.target.value)} rows={3} /></label><Button type="submit">Save profile</Button></form>}
      <Tabs tabs={["Posts", "Replies", "Launches", "Positions"]} active={tab} onChange={(value) => setTab(value as ProfileTab)} label="Profile activity" />
      {(tab === "Posts" || tab === "Replies") && <div className="ps-feed">{items.map((post) => <PostCard key={post.id} post={post} />)}{!items.length && <EmptyState title={`No ${tab.toLowerCase()} yet`} copy={`Real ${tab.toLowerCase()} from this profile will appear here.`} />}</div>}
      {tab === "Launches" && <div className="ps-profile-cards">{launches.map((token) => <LaunchCard key={token.address} token={token} />)}{profile.data.launchesError ? <ServiceState title="Launch data unavailable" copy={profile.data.launchesError} /> : !launches.length && <EmptyState title="No launches yet" copy="Confirmed onchain launches connected to this wallet will appear here." />}</div>}
      {tab === "Positions" && (own ? <div className="ps-profile-cards">{balances.data ? <WalletActions wallet={balances.data} onComplete={balances.refresh} /> : balances.error ? <ServiceState title="Wallet unavailable" copy={balances.error} /> : <div className="ps-loading-list"><i /><i /></div>}</div> : <EmptyState title="Positions are private" copy="Wallet balances are visible only to their owner." />)}
    </section>
  );
}

export function OwnProfileView() { return <ProfileView own />; }
