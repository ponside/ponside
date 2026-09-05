import { TokenDetail } from "@/components/product/token-detail";

export default async function TokenPage({ params }: PageProps<"/token/[address]">) {
  const { address } = await params;
  return <TokenDetail address={address} />;
}
