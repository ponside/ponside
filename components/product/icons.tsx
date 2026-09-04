import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "explore"
  | "launch"
  | "bell"
  | "user"
  | "search"
  | "plus"
  | "image"
  | "coin"
  | "chart"
  | "comment"
  | "repost"
  | "heart"
  | "bookmark"
  | "more"
  | "arrow"
  | "close"
  | "check"
  | "chevron"
  | "share"
  | "wallet";

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3.5 10.4 12 3.5l8.5 6.9"/><path d="M5.8 9.2v11.3h12.4V9.2M9.3 20.5v-6.3h5.4v6.3"/></>,
  explore: <><circle cx="12" cy="12" r="8.7"/><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z"/></>,
  launch: <><path d="M14.2 4.1c2.2-1 4.4-.9 5.7-.7.2 1.4.3 3.6-.7 5.8-1.2 2.7-4 5.2-7.1 6.5l-3.8-3.8c1.2-3.1 3.8-5.9 5.9-7.8Z"/><path d="m8.6 14.2-3.2.5-1.9 3.1 3.8-1.1m2.5 0-.5 3.8 3.1-1.9.5-3.2"/><circle cx="15.2" cy="8" r="1.3"/></>,
  bell: <><path d="M6.2 9.5a5.8 5.8 0 0 1 11.6 0c0 6.5 2.2 6.5 2.2 7.8H4c0-1.3 2.2-1.3 2.2-7.8Z"/><path d="M9.4 20h5.2"/></>,
  user: <><circle cx="12" cy="8" r="3.7"/><path d="M4.8 20c.6-4 3.1-6 7.2-6s6.6 2 7.2 6"/></>,
  search: <><circle cx="10.7" cy="10.7" r="6.4"/><path d="m15.5 15.5 4.2 4.2"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m5.5 17 4.2-4.2 2.8 2.8 2.4-2.4 3.6 3.8"/></>,
  coin: <><circle cx="12" cy="12" r="8.5"/><path d="M14.8 8.5c-.7-.6-1.6-.9-2.8-.9-1.6 0-2.8.8-2.8 2 0 3.2 6 1.5 6 4.8 0 1.2-1.2 2-3.1 2-1.3 0-2.4-.4-3.1-1.1M12 5.5v13"/></>,
  chart: <><path d="M4 19V5M4 19h16"/><path d="m7 15 3-3 2.7 1.8L18 8"/></>,
  comment: <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 9.4 9.4 0 0 1-3.3-.6L4 20l1.5-4a7.2 7.2 0 0 1-1.5-4.5A7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/>,
  repost: <><path d="m7 7 3-3 3 3M10 4v11"/><path d="m17 17-3 3-3-3m3 3V9"/></>,
  heart: <path d="M20.4 8.4c0 5.1-8.4 10.4-8.4 10.4S3.6 13.5 3.6 8.4A4.4 4.4 0 0 1 12 6.5a4.4 4.4 0 0 1 8.4 1.9Z"/>,
  bookmark: <path d="M6.2 4h11.6v16L12 16.5 6.2 20V4Z"/>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  check: <path d="m5 12 4.2 4.2L19 6.5"/>,
  chevron: <path d="m8 10 4 4 4-4"/>,
  share: <><circle cx="18" cy="5" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="18" cy="19" r="2"/><path d="m7.8 11 8.4-4.8m-8.4 6.8 8.4 4.8"/></>,
  wallet: <><path d="M4 6.5h14.5a1.5 1.5 0 0 1 1.5 1.5v10H5.5A1.5 1.5 0 0 1 4 16.5v-10Z"/><path d="M4.5 6.5 16 3.8v2.7M15 11h5v4h-5a2 2 0 0 1 0-4Z"/></>,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {paths[name]}
    </svg>
  );
}
