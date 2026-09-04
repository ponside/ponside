import { ProfileView } from "@/components/product/profile-view";
import { getUserByHandle, users } from "@/lib/mock-data";

export function generateStaticParams() {
  return users.map((user) => ({ handle: user.handle }));
}

export default async function PublicProfilePage({ params }: PageProps<"/app/u/[handle]">) {
  const { handle } = await params;
  return <ProfileView user={getUserByHandle(handle)} />;
}
