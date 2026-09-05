"use client";

import Link from "next/link";
import type { NotificationItem } from "@/lib/domain";
import { apiRequest } from "@/lib/client/api";
import { Icon, type IconName } from "@/components/product/icons";
import { Avatar, Button, EmptyState, ServiceState } from "@/components/product/primitives";
import { useProductAuth } from "@/components/product/product-providers";
import { useApiResource } from "@/components/product/use-resource";

const icons: Record<NotificationItem["type"], IconName> = { like: "heart", repost: "repost", follow: "user", reply: "comment", mention: "comment" };
const copy: Record<NotificationItem["type"], string> = { like: "liked your post", repost: "reposted your post", follow: "followed you", reply: "replied to your post", mention: "mentioned you" };
export function NotificationsView() {
  const auth = useProductAuth(); const list = useApiResource<{ notifications: NotificationItem[] }>(auth.authenticated ? "/api/notifications" : null, { requiresAuth: true });
  async function markRead() { const token = await auth.getToken(); await apiRequest("/api/notifications", { method: "PATCH" }, token); await list.refresh(); }
  if (!auth.authenticated) return <section className="ps-view"><ServiceState title="Sign in for notifications" copy="Notifications are available after server-verified X authentication." action={<Button onClick={() => auth.login("notifications")} disabled={!auth.configured}>Sign in with X</Button>} /></section>;
  return <section className="ps-view"><header className="ps-page-header"><div><span className="ps-eyebrow">Activity</span><h1>Notifications</h1></div>{list.data?.notifications.some((item) => !item.read) && <button className="ps-text-button" type="button" onClick={() => void markRead()}>Mark all read</button>}</header>{list.error && <ServiceState title="Notifications unavailable" copy={list.error} />}{list.loading && <div className="ps-loading-list"><i /><i /><i /></div>}<div className="ps-notification-list">{list.data?.notifications.map((item) => { const body = <><span className="ps-notification-avatar"><Avatar user={item.actor} /><i><Icon name={icons[item.type]} /></i></span><span><strong>{item.actor.name}</strong> {copy[item.type]}<small>{new Date(item.createdAt).toLocaleString()}</small></span>{!item.read && <em aria-label="Unread" />}</>; return item.postId ? <Link key={item.id} className={item.read ? "" : "is-unread"} href={`/post/${item.postId}`}>{body}</Link> : <Link key={item.id} className={item.read ? "" : "is-unread"} href={`/u/${item.actor.handle}`}>{body}</Link>; })}</div>{!list.loading && !list.error && !list.data?.notifications.length && <EmptyState title="No notifications yet" copy="Real likes, reposts, follows, and replies will appear here." />}</section>;
}
