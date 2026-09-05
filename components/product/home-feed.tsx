"use client";

import { useMemo, useState } from "react";
import type { SocialPost } from "@/lib/domain";
import { apiRequest } from "@/lib/client/api";
import { Avatar, Button, ServiceState, Tabs } from "@/components/product/primitives";
import { PostCard } from "@/components/product/post-card";
import { useProductAuth } from "@/components/product/product-providers";
import { useApiResource } from "@/components/product/use-resource";

export function HomeFeed() {
  const [tab, setTab] = useState("For You");
  const [copy, setCopy] = useState("");
  const [posting, setPosting] = useState(false);
  const auth = useProductAuth();
  const path = useMemo(() => `/api/feed?mode=${tab === "Following" ? "following" : "all"}`, [tab]);
  const feed = useApiResource<{ posts: SocialPost[] }>(path);
  async function submit() {
    if (!auth.authenticated) { auth.login("create-post"); return; }
    if (!copy.trim()) return;
    setPosting(true);
    try { const token = await auth.getToken(); await apiRequest("/api/posts", { method: "POST", body: JSON.stringify({ content: copy }) }, token); setCopy(""); await feed.refresh(); }
    finally { setPosting(false); }
  }
  function selectTab(value: string) {
    if (value === "Following" && !auth.authenticated) { auth.login("following-feed"); return; }
    setTab(value);
  }
  return <section className="ps-feed-column"><header className="ps-page-header"><div><span className="ps-eyebrow">Your circle</span><h1>Home</h1></div><span className="ps-live-status"><i /> Onchain markets</span></header><Tabs tabs={["For You", "Following"]} active={tab} onChange={selectTab} label="Home feed" /><div className="ps-composer"><Avatar user={auth.profile} /><div className="ps-composer-main"><textarea value={copy} onChange={(event) => setCopy(event.target.value)} placeholder={auth.authenticated ? "What's moving?" : "Sign in with X to post"} aria-label="Create a post" rows={2} disabled={!auth.configured} /><div className="ps-composer-footer"><span className="ps-form-hint">Posts are stored only after server-verified authentication.</span><Button type="button" disabled={posting || (auth.authenticated && !copy.trim()) || !auth.configured} onClick={() => void submit()}>{posting ? "Posting…" : auth.authenticated ? "Post" : "Sign in with X"}</Button></div></div></div>{feed.loading && <div className="ps-loading-list"><i /><i /><i /></div>}{feed.error && <ServiceState title="Feed unavailable" copy={feed.error} action={<button className="ps-text-button" onClick={() => void feed.refresh()}>Try again</button>} />}{!feed.loading && !feed.error && !feed.data?.posts.length && <ServiceState title="The feed is quiet" copy="Real posts will appear here as people join the conversation." />}{feed.data && <div className="ps-feed" aria-live="polite">{feed.data.posts.map((post) => <PostCard key={post.id} post={post} />)}</div>}</section>;
}
