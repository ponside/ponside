"use client";

import Link from "next/link";
import { useState } from "react";
import type { Post } from "@/lib/mock-data";
import { getToken, getUser, launches, positions } from "@/lib/mock-data";
import { Icon } from "@/components/product/icons";
import { Avatar } from "@/components/product/primitives";
import { LaunchCard, MarketVisual, PositionCard, TokenCard } from "@/components/product/market-cards";

export function PostCard({ post, detail = false }: { post: Post; detail?: boolean }) {
  const user = getUser(post.userId);
  const [liked, setLiked] = useState(Boolean(post.liked));
  const [reposted, setReposted] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  return (
    <article className={`ps-post${detail ? " is-detail" : ""}`}>
      <div className="ps-post-avatar"><Link href={`/app/u/${user.handle}`} aria-label={`${user.name}'s profile`}><Avatar user={user} /></Link></div>
      <div className="ps-post-content">
        <header className="ps-post-header">
          <Link className="ps-post-author" href={`/app/u/${user.handle}`}><strong>{user.name}</strong>{user.verified && <span className="ps-verified"><Icon name="check" /></span>}<span>@{user.handle}</span></Link>
          <Link className="ps-post-time" href={`/app/post/${post.id}`}>· {post.timestamp}</Link>
          <button className="ps-icon-button ps-post-more" type="button" aria-label="More post actions"><Icon name="more" /></button>
        </header>
        <p className="ps-post-body">{post.body}</p>
        {post.kind === "token" && post.tokenId && <TokenCard token={getToken(post.tokenId)} />}
        {post.kind === "position" && post.positionId && <PositionCard position={positions.find((item) => item.id === post.positionId)!} />}
        {post.kind === "launch" && post.launchId && <LaunchCard launch={launches.find((item) => item.id === post.launchId)!} />}
        {post.kind === "image" && <MarketVisual />}
        <footer className="ps-post-actions">
          <button className={showReply ? "is-active" : ""} type="button" onClick={() => setShowReply((value) => !value)} aria-label="Comment"><Icon name="comment" /><span>{post.comments}</span></button>
          <button className={reposted ? "is-reposted" : ""} type="button" onClick={() => setReposted((value) => !value)} aria-label="Repost"><Icon name="repost" /><span>{post.reposts + (reposted ? 1 : 0)}</span></button>
          <button className={liked ? "is-liked" : ""} type="button" onClick={() => setLiked((value) => !value)} aria-label="Like"><Icon name="heart" /><span>{post.likes + (liked && !post.liked ? 1 : liked === false && post.liked ? -1 : 0)}</span></button>
          <button className={bookmarked ? "is-bookmarked" : ""} type="button" onClick={() => setBookmarked((value) => !value)} aria-label="Bookmark"><Icon name="bookmark" /></button>
        </footer>
        {showReply && <form className="ps-inline-reply" onSubmit={(event) => { event.preventDefault(); setShowReply(false); }}><input aria-label="Write a reply" placeholder="Write a reply" autoFocus /><button type="submit">Reply</button></form>}
      </div>
    </article>
  );
}
