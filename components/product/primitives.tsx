"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Profile } from "@/lib/domain";
import { initialsFor } from "@/lib/domain";
import { highQualityAvatarUrl } from "@/lib/avatar";
import { apiRequest } from "@/lib/client/api";
import { useProductAuth } from "@/components/product/product-providers";
import { Icon } from "@/components/product/icons";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link className={`ps-brand${compact ? " ps-brand-compact" : ""}`} href="/" aria-label="Ponside home"><span className="ps-brand-mark"><Image src="/icon.png" alt="" width={38} height={38} priority /></span>{!compact && <span>Ponside</span>}</Link>;
}

export function Avatar({ user, size = "md" }: { user: Profile | null; size?: "sm" | "md" | "lg" | "xl" }) {
  const avatarUrl = highQualityAvatarUrl(user?.avatarUrl);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl && failedUrl !== avatarUrl);
  const pixels = { sm: 66, md: 84, lg: 116, xl: 168 }[size];
  return <span className={`ps-avatar ps-avatar-${size}`}>
    {showImage && avatarUrl
      ? <Image className="ps-avatar-image" src={avatarUrl} alt="" width={pixels} height={pixels} quality={95} sizes={`${pixels / 2}px`} onError={() => setFailedUrl(avatarUrl)} />
      : user ? initialsFor(user.name) : "P"}
  </span>;
}

export function UserIdentity({ user, compact = false }: { user: Profile; compact?: boolean }) {
  return <span className="ps-identity"><Avatar user={user} size={compact ? "sm" : "md"} /><span className="ps-identity-copy"><span className="ps-name-row"><strong>{user.name}</strong></span><span>@{user.handle}</span></span></span>;
}

export function FollowButton({ profileId, initial = false, disabled = false }: { profileId: string; initial?: boolean; disabled?: boolean }) {
  const auth = useProductAuth();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (!auth.authenticated) { auth.login(`follow:${profileId}`); return; }
    setBusy(true);
    try { const token = await auth.getToken(); await apiRequest(`/api/follows/${profileId}`, { method: following ? "DELETE" : "POST" }, token); setFollowing(!following); } finally { setBusy(false); }
  }
  return <button className={`ps-follow${following ? " is-following" : ""}`} type="button" onClick={() => void toggle()} disabled={disabled || busy}>{busy ? "Saving…" : following ? <><Icon name="check" />Following</> : "Follow"}</button>;
}

export function Button({ children, tone = "primary", icon, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; tone?: "primary" | "secondary" | "quiet"; icon?: ReactNode }) {
  return <button className={`ps-button ps-button-${tone} ${className}`} {...props}>{icon}{children}</button>;
}

export function Tabs({ tabs, active, onChange, label }: { tabs: string[]; active: string; onChange: (tab: string) => void; label: string }) {
  return <div className="ps-tabs" role="tablist" aria-label={label}>{tabs.map((tab) => <button key={tab} className={active === tab ? "is-active" : ""} type="button" role="tab" aria-selected={active === tab} onClick={() => onChange(tab)}>{tab}</button>)}</div>;
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="ps-empty"><span className="ps-empty-mark" /><h3>{title}</h3><p>{copy}</p></div>;
}

export function ServiceState({ title, copy, action }: { title: string; copy: string; action?: ReactNode }) {
  return <div className="ps-empty ps-service-state"><span className="ps-empty-mark" /><h3>{title}</h3><p>{copy}</p>{action}</div>;
}
