export function FeedSkeleton() {
  return <div className="ps-skeleton-list" aria-label="Loading feed">{[1, 2, 3].map((item) => <article className="ps-post-skeleton" key={item}><span className="ps-skeleton-circle" /><div><span className="ps-skeleton-line is-short" /><span className="ps-skeleton-line" /><span className="ps-skeleton-line is-medium" /><TokenCardSkeleton /></div></article>)}</div>;
}

export function TokenCardSkeleton() {
  return <div className="ps-token-skeleton"><span className="ps-skeleton-square" /><div><span className="ps-skeleton-line is-short" /><span className="ps-skeleton-line is-medium" /></div></div>;
}

export function ProfileSkeleton() {
  return <div className="ps-profile-skeleton"><span className="ps-skeleton-circle is-large" /><span className="ps-skeleton-line is-short" /><span className="ps-skeleton-line is-medium" /></div>;
}

export function TokenPageSkeleton() {
  return <div className="ps-token-page-skeleton"><TokenCardSkeleton /><span className="ps-skeleton-block" /><FeedSkeleton /></div>;
}

export function TrendingListSkeleton() {
  return <div className="ps-trending-skeleton">{[1, 2, 3].map((item) => <TokenCardSkeleton key={item} />)}</div>;
}
