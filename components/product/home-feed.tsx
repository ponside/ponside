"use client";

import { useState } from "react";
import type { Post } from "@/lib/mock-data";
import { currentUser, posts } from "@/lib/mock-data";
import { Icon } from "@/components/product/icons";
import { Avatar, Button, Tabs } from "@/components/product/primitives";
import { PostCard } from "@/components/product/post-card";

export function HomeFeed() {
  const [tab, setTab] = useState("For You");
  const [copy, setCopy] = useState("");
  const [focused, setFocused] = useState(false);
  const [localPosts, setLocalPosts] = useState<Post[]>(posts);

  function submitPost() {
    const body = copy.trim();
    if (!body) return;
    setLocalPosts((items) => [{ id: `local-${Date.now()}`, userId: currentUser.id, body, timestamp: "now", kind: "thought", comments: 0, reposts: 0, likes: 0 }, ...items]);
    setCopy("");
    setFocused(false);
  }

  const visiblePosts = tab === "Following" ? localPosts.filter((post) => ["ari", "maya", "you"].includes(post.userId)) : localPosts;

  return (
    <section className="ps-feed-column">
      <header className="ps-page-header"><div><span className="ps-eyebrow">Your circle</span><h1>Home</h1></div><span className="ps-live-status"><i /> Markets live</span></header>
      <Tabs tabs={["For You", "Following"]} active={tab} onChange={setTab} label="Home feed" />
      <div className={`ps-composer${focused ? " is-focused" : ""}`}>
        <Avatar user={currentUser} />
        <div className="ps-composer-main">
          <textarea value={copy} onChange={(event) => setCopy(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => !copy && setFocused(false)} placeholder="What's moving?" aria-label="Create a post" rows={focused ? 3 : 1} />
          <div className="ps-composer-footer">
            <div><button type="button"><Icon name="image" />Image</button><button type="button"><Icon name="coin" />Token</button><button type="button"><Icon name="chart" />Position</button></div>
            <Button type="button" disabled={!copy.trim()} onClick={submitPost}>Post</Button>
          </div>
        </div>
      </div>
      <div className="ps-feed" aria-live="polite">{visiblePosts.map((post) => <PostCard key={post.id} post={post} />)}</div>
    </section>
  );
}
