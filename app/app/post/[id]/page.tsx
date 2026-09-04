import { PostDetail } from "@/components/product/post-detail";
import { getPost, posts } from "@/lib/mock-data";

export function generateStaticParams() {
  return posts.map((post) => ({ id: post.id }));
}

export default async function PostPage({ params }: PageProps<"/app/post/[id]">) {
  const { id } = await params;
  return <PostDetail post={getPost(id)} />;
}
