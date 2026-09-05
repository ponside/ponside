import { PostDetail } from "@/components/product/post-detail";

export default async function PostPage({ params }: PageProps<"/post/[id]">) {
  const { id } = await params;
  return <PostDetail id={id} />;
}
