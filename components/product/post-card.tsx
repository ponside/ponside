"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SocialPost } from "@/lib/domain";
import { apiRequest } from "@/lib/client/api";
import { Icon } from "@/components/product/icons";
import { Avatar } from "@/components/product/primitives";
import { useProductAuth } from "@/components/product/product-providers";

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function PostCard({ post, detail = false, onReply }: { post: SocialPost; detail?: boolean; onReply?: () => void }) {
  const router = useRouter();
  const auth = useProductAuth();
  const [liked, setLiked] = useState(post.liked);
  const [reposted, setReposted] = useState(post.reposted);
  const [busy, setBusy] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  async function relation(kind: "like" | "repost", active: boolean) {
    if (!auth.authenticated) { auth.login(`${kind}:${post.id}`); return; }
    setBusy(kind);
    try {
      const token = await auth.getToken();
      await apiRequest(`/api/posts/${post.id}/${kind}`, { method: active ? "DELETE" : "POST" }, token);
      if (kind === "like") setLiked(!active); else setReposted(!active);
    } finally { setBusy(null); }
  }
  async function remove() {
    if (!confirm("Delete this post?")) return;
    setBusy("delete");
    try { const token = await auth.getToken(); await apiRequest(`/api/posts/${post.id}`, { method: "DELETE" }, token); setRemoved(true); } finally { setBusy(null); }
  }
  if (removed) return null;
  onReply ??= () => { router.push(`/post/${post.id}`); };
  return <article className={`ps-post${detail ? " is-detail" : ""}`}><div className="ps-post-avatar"><Link href={`/u/${post.author.handle}`} aria-label={`${post.author.name}'s profile`}><Avatar user={post.author} /></Link></div><div className="ps-post-content"><header className="ps-post-header"><Link className="ps-post-author" href={`/u/${post.author.handle}`}><strong>{post.author.name}</strong><span>@{post.author.handle}</span></Link><Link className="ps-post-time" href={`/post/${post.id}`}>· {relativeTime(post.createdAt)}</Link>{post.canDelete && <button className="ps-icon-button ps-post-more" type="button" onClick={() => void remove()} disabled={busy === "delete"} aria-label="Delete post"><Icon name="close" /></button>}</header><p className="ps-post-body">{post.body}</p>{post.media.map((media) => <a className="ps-post-media" href={media.url} target="_blank" rel="noopener noreferrer" key={media.id}><span style={{ backgroundImage: `url(${JSON.stringify(media.url).slice(1, -1)})` }} role="img" aria-label="Post attachment" /></a>)}{post.tokenAddress && <Link className="ps-linked-token" href={`/token/${post.tokenAddress}`}><Icon name="coin" />View linked token <span>{post.tokenAddress.slice(0, 8)}…{post.tokenAddress.slice(-6)}</span></Link>}<footer className="ps-post-actions"><button type="button" onClick={onReply} aria-label="Reply"><Icon name="comment" /><span>{post.replies}</span></button><button className={reposted ? "is-reposted" : ""} type="button" disabled={busy === "repost"} onClick={() => void relation("repost", reposted)} aria-label="Repost"><Icon name="repost" /><span>{post.reposts + (reposted && !post.reposted ? 1 : !reposted && post.reposted ? -1 : 0)}</span></button><button className={liked ? "is-liked" : ""} type="button" disabled={busy === "like"} onClick={() => void relation("like", liked)} aria-label="Like"><Icon name="heart" /><span>{post.likes + (liked && !post.liked ? 1 : !liked && post.liked ? -1 : 0)}</span></button></footer></div></article>;
}
