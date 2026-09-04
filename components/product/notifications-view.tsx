"use client";

import { useState } from "react";
import { getUser, notifications as initialNotifications } from "@/lib/mock-data";
import { Icon, type IconName } from "@/components/product/icons";
import { Avatar } from "@/components/product/primitives";

const notificationIcons: Record<string, IconName> = { like: "heart", repost: "repost", follow: "user", reply: "comment", mention: "coin" };

export function NotificationsView() {
  const [items, setItems] = useState(initialNotifications);
  const unread = items.some((item) => item.unread);
  return (
    <section className="ps-view">
      <header className="ps-page-header"><div><span className="ps-eyebrow">Activity</span><h1>Notifications</h1></div>{unread && <button className="ps-text-button" type="button" onClick={() => setItems((values) => values.map((item) => ({ ...item, unread: false })))}>Mark all read</button>}</header>
      <div className="ps-notification-list">{items.map((item) => { const user = getUser(item.userId); return <button key={item.id} className={item.unread ? "is-unread" : ""} type="button" onClick={() => setItems((values) => values.map((value) => value.id === item.id ? { ...value, unread: false } : value))}><span className="ps-notification-avatar"><Avatar user={user} /><i><Icon name={notificationIcons[item.type]} /></i></span><span><strong>{user.name}</strong> {item.copy}<small>{item.timestamp}</small></span>{item.unread && <em aria-label="Unread" />}</button>; })}</div>
    </section>
  );
}
