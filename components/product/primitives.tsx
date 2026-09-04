"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { User } from "@/lib/mock-data";
import { Icon } from "@/components/product/icons";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`ps-brand${compact ? " ps-brand-compact" : ""}`} href="/app" aria-label="Ponside home">
      <span className="ps-brand-mark"><Image src="/icon.png" alt="" width={38} height={38} priority /></span>
      {!compact && <span>Ponside</span>}
    </Link>
  );
}

export function Avatar({ user, size = "md" }: { user: User; size?: "sm" | "md" | "lg" | "xl" }) {
  return <span className={`ps-avatar ps-avatar-${size}`} style={{ "--avatar-accent": user.accent } as React.CSSProperties}>{user.initials}</span>;
}

export function UserIdentity({ user, compact = false }: { user: User; compact?: boolean }) {
  return (
    <span className="ps-identity">
      <Avatar user={user} size={compact ? "sm" : "md"} />
      <span className="ps-identity-copy">
        <span className="ps-name-row"><strong>{user.name}</strong>{user.verified && <span className="ps-verified" aria-label="Verified"><Icon name="check" /></span>}</span>
        <span>@{user.handle}</span>
      </span>
    </span>
  );
}

export function FollowButton({ initial = false }: { initial?: boolean }) {
  const [following, setFollowing] = useState(initial);
  return <button className={`ps-follow${following ? " is-following" : ""}`} type="button" onClick={() => setFollowing((value) => !value)}>{following ? <><Icon name="check" />Following</> : "Follow"}</button>;
}

export function Button({ children, tone = "primary", icon, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; tone?: "primary" | "secondary" | "quiet"; icon?: ReactNode }) {
  return <button className={`ps-button ps-button-${tone} ${className}`} {...props}>{icon}{children}</button>;
}

export function Tabs({ tabs, active, onChange, label }: { tabs: string[]; active: string; onChange: (tab: string) => void; label: string }) {
  return (
    <div className="ps-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => <button key={tab} className={active === tab ? "is-active" : ""} type="button" role="tab" aria-selected={active === tab} onClick={() => onChange(tab)}>{tab}</button>)}
    </div>
  );
}

export function Sparkline({ values, negative = false, label = "Price trend" }: { values: number[]; negative?: boolean; label?: string }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 120},${48 - (value / 100) * 42}`).join(" ");
  return (
    <svg className={`ps-spark${negative ? " is-negative" : ""}`} viewBox="0 0 120 48" role="img" aria-label={label} preserveAspectRatio="none">
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="ps-empty"><span className="ps-empty-mark" /><h3>{title}</h3><p>{copy}</p></div>;
}
