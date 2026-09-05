"use client";

import { useRef, useState } from "react";
import type { SocialPost } from "@/lib/domain";
import { apiRequest } from "@/lib/client/api";
import { Icon } from "@/components/product/icons";
import { PostCard } from "@/components/product/post-card";
import { Avatar, Button, EmptyState, ServiceState } from "@/components/product/primitives";
import { useProductAuth } from "@/components/product/product-providers";
import { useApiResource } from "@/components/product/use-resource";

export function PostDetail({ id }: { id: string }) {
  const auth = useProductAuth(); const [reply, setReply] = useState(""); const [busy, setBusy] = useState(false); const input = useRef<HTMLTextAreaElement>(null); const resource = useApiResource<{ post: SocialPost; replies: SocialPost[] }>(`/api/posts/${id}`);
  async function submit() { if (!auth.authenticated) { auth.login(`reply:${id}`); return; } if (!reply.trim()) return; setBusy(true); try { const token = await auth.getToken(); await apiRequest("/api/posts", { method: "POST", body: JSON.stringify({ content: reply, replyToPostId: id }) }, token); setReply(""); await resource.refresh(); } finally { setBusy(false); } }
  if (resource.loading) return <section className="ps-view"><div className="ps-loading-list"><i /><i /></div></section>;
  if (resource.error || !resource.data) return <section className="ps-view"><ServiceState title="Post unavailable" copy={resource.error || "This post could not be loaded."} /></section>;
  const { post, replies } = resource.data;
  return <section className="ps-view ps-post-detail"><header className="ps-page-header"><div className="ps-detail-title"><Icon name="comment" /><div><span className="ps-eyebrow">Conversation</span><h1>Post</h1></div></div></header><PostCard post={post} detail onReply={() => input.current?.focus()} /><div className="ps-engagement-strip"><span><strong>{post.reposts}</strong> Reposts</span><span><strong>{post.likes}</strong> Likes</span><span><strong>{post.replies}</strong> Replies</span></div><form className="ps-reply-composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}><Avatar user={auth.profile} /><label><span>{auth.authenticated ? `Replying to @${post.author.handle}` : "Sign in with X to reply"}</span><textarea ref={input} value={reply} maxLength={2000} onChange={(event) => setReply(event.target.value)} placeholder="Add to the conversation" rows={2} /></label><Button type="submit" disabled={busy || (auth.authenticated && !reply.trim()) || !auth.configured}>{busy ? "Replying…" : auth.authenticated ? "Reply" : "Sign in"}</Button></form><div className="ps-replies" aria-live="polite">{replies.map((item) => <PostCard key={item.id} post={item} />)}{!replies.length && <EmptyState title="No replies yet" copy="Start the conversation." />}</div></section>;
}
