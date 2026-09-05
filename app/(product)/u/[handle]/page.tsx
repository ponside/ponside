import { ProfileView } from "@/components/product/profile-view";

export default async function PublicProfilePage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  return <ProfileView handle={handle} />;
}
