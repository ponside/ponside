"use client";

import { useState } from "react";
import type { Post } from "@/lib/mock-data";
import { currentUser, getUser } from "@/lib/mock-data";
import { Icon } from "@/components/product/icons";
import { PostCard } from "@/components/product/post-card";
import { Avatar, Button } from "@/components/product/primitives";

export function PostDetail({ post }: { post: Post }) {
  const [reply, setReply] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);
  const replies: Post[] = [
    { id: "reply-one", userId: "maya", body: "The social velocity is as interesting as the price action here.", timestamp: "2m", kind: "thought", comments: 2, reposts: 4, likes: 26 },
    { id: "reply-two", userId: "sol", body: "Volume held through the pullback. Still watching.", timestamp: "8m", kind: "thought", comments: 1, reposts: 2, likes: 18 },
  ];
  return (
    <section className="ps-view ps-post-detail">
      <header className="ps-page-header"><div className="ps-detail-title"><Icon name="comment" /><div><span className="ps-eyebrow">Conversation</span><h1>Post</h1></div></div></header>
      <PostCard post={post} detail />
      <div className="ps-engagement-strip"><span><strong>{post.reposts}</strong> Reposts</span><span><strong>{post.likes}</strong> Likes</span><span><strong>{post.comments}</strong> Replies</span></div>
      <form className="ps-reply-composer" onSubmit={(event) => { event.preventDefault(); if (reply.trim()) { setSubmitted((items) => [reply.trim(), ...items]); setReply(""); } }}><Avatar user={currentUser} /><label><span>Replying to <strong>@{getUser(post.userId).handle}</strong></span><textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Add to the conversation" rows={2} /></label><Button type="submit" disabled={!reply.trim()}>Reply</Button></form>
      <div className="ps-replies" aria-live="polite">{submitted.map((body, index) => <PostCard key={`${body}-${index}`} post={{ id: `local-reply-${index}`, userId: currentUser.id, body, timestamp: "now", kind: "thought", comments: 0, reposts: 0, likes: 0 }} />)}{replies.map((item) => <PostCard key={item.id} post={item} />)}</div>
    </section>
  );
}
