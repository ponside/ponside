import { FeedSkeleton } from "@/components/product/loading-states";

export default function ProductLoading() {
  return <section className="ps-view"><header className="ps-page-header"><div><span className="ps-eyebrow">Loading</span><h1>Ponside</h1></div></header><FeedSkeleton /></section>;
}
