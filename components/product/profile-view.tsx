"use client";

import { useState } from "react";
import type { User } from "@/lib/mock-data";
import { currentUser, launches, positions, posts } from "@/lib/mock-data";
import { Icon } from "@/components/product/icons";
import { LaunchCard, PositionCard } from "@/components/product/market-cards";
import { PostCard } from "@/components/product/post-card";
import { Avatar, Button, EmptyState, FollowButton, Tabs } from "@/components/product/primitives";

type ProfileTab = "Posts" | "Replies" | "Launches" | "Positions";

export function ProfileView({ user, own = false }: { user: User; own?: boolean }) {
  const [tab, setTab] = useState<ProfileTab>("Posts");
  const userPosts = posts.filter((post) => post.userId === user.id);
  const profilePosts = userPosts.length ? userPosts : posts.slice(0, 2).map((post) => ({ ...post, userId: user.id }));
  return (
    <section className="ps-view">
      <header className="ps-profile-cover"><span className="ps-profile-signal" /><div className="ps-profile-header"><Avatar user={user} size="xl" /><div className="ps-profile-actions">{own ? <Button tone="secondary" type="button">Edit profile</Button> : <FollowButton />}</div></div></header>
      <div className="ps-profile-copy"><h1>{user.name}{user.verified && <span className="ps-verified"><Icon name="check" /></span>}</h1><span>@{user.handle}</span><p>{user.bio}</p><div className="ps-profile-meta"><span><Icon name="wallet" />0x7A91…2F0C</span></div><div className="ps-profile-stats"><span><strong>{user.following}</strong> Following</span><span><strong>{user.followers}</strong> Followers</span></div></div>
      <Tabs tabs={["Posts", "Replies", "Launches", "Positions"]} active={tab} onChange={(value) => setTab(value as ProfileTab)} label="Profile activity" />
      {tab === "Posts" && <div className="ps-feed">{profilePosts.map((post) => <PostCard key={post.id} post={post} />)}</div>}
      {tab === "Replies" && <EmptyState title="No replies yet" copy="Conversations this profile joins will show up here." />}
      {tab === "Launches" && <div className="ps-profile-cards">{launches.filter((launch) => own || launch.creatorId === user.id).map((launch) => <LaunchCard key={launch.id} launch={launch} />)}{!own && launches.every((launch) => launch.creatorId !== user.id) && <EmptyState title="No launches yet" copy="New launches will be collected here." />}</div>}
      {tab === "Positions" && (own ? <div className="ps-profile-cards">{positions.map((position) => <PositionCard key={position.id} position={position} />)}</div> : <EmptyState title="Positions are private" copy="This profile has not shared any positions." />)}
    </section>
  );
}

export function OwnProfileView() {
  return <ProfileView user={currentUser} own />;
}
