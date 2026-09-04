import { TokenDetail } from "@/components/product/token-detail";
import { getTokenByAddress, tokens } from "@/lib/mock-data";

export function generateStaticParams() {
  return tokens.map((token) => ({ address: token.address }));
}

export default async function TokenPage({ params }: PageProps<"/app/token/[address]">) {
  const { address } = await params;
  return <TokenDetail token={getTokenByAddress(address)} />;
}
