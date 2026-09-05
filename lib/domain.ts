export type Profile = {
  id: string;
  name: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  walletAddress: string | null;
  followers: number;
  following: number;
  isFollowing?: boolean;
  isOwn?: boolean;
};

export type MediaAttachment = {
  id: string;
  url: string;
  type: string;
};

export type SocialPost = {
  id: string;
  body: string;
  createdAt: string;
  author: Profile;
  tokenAddress: string | null;
  replyToPostId: string | null;
  media: MediaAttachment[];
  likes: number;
  reposts: number;
  replies: number;
  liked: boolean;
  reposted: boolean;
  canDelete: boolean;
};

export type TokenMarket = {
  address: string;
  curveAddress: string;
  name: string;
  symbol: string;
  logoUrl: string | null;
  description: string;
  pairAddress: string;
  pairSymbol: string;
  pairDecimals: number;
  tokenDecimals: number;
  totalSupply: string | null;
  phase: number;
  phaseLabel: string;
  creator: Profile | null;
  isPonsideLaunch: boolean;
  launchBlock: number;
  launchTimestamp: string;
  launchTxHash: string;
  priceRaw: string | null;
  marketCapRaw: string | null;
  marketCapUsdE18: string | null;
  quoteUsdPriceE18: string | null;
  quoteUsdObservedAt: string | null;
  activityWindow: "all" | "24h" | "7d";
  activityCoverageStartedAt: string | null;
  activityWindowComplete: boolean;
  activityCount: number;
  volumeRaw: string | null;
  volumeUsdE18: string | null;
  tradeCount: number;
  changeBps: number | null;
  socialEngagement: number;
  bondingProgressBps: number | null;
  realQuoteReserve: string | null;
  graduationThreshold: string;
  chart: Array<{ timestamp: string; priceRaw: string }>;
  sellableTokens: string | null;
  readyToGraduate: boolean | null;
  graduated: boolean;
  marketDataFresh: boolean;
  marketDataObservedAt: string | null;
};

export type IndexedTrade = {
  txHash: string;
  logIndex: number;
  traderAddress: string;
  recipientAddress: string;
  side: "buy" | "sell";
  quoteAmount: string;
  tokenAmount: string;
  feeAmount: string;
  creatorTaxAmount: string;
  blockNumber: number;
  timestamp: string;
};

export type NotificationItem = {
  id: string;
  type: "follow" | "like" | "reply" | "repost" | "mention";
  actor: Profile;
  postId: string | null;
  createdAt: string;
  read: boolean;
};

export type PreparedTransaction = {
  chainId: 4663;
  to: `0x${string}`;
  data: `0x${string}`;
  value: `0x${string}`;
  gas?: `0x${string}`;
  summary: string;
};

export type WalletTransactionStage = "awaiting-signature" | "submitted" | "confirming" | "confirmed";

export type WalletTransactionUpdate = {
  stage: WalletTransactionStage;
  transactionIndex: number;
  transactionCount: number;
  hash?: `0x${string}`;
};

export type WalletMarketReference = {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenLogoUrl: string | null;
  pairAddress: string;
  pairSymbol: string;
  pairDecimals: number;
  phase: number;
};

export type WalletAsset = {
  kind: "native" | "erc20";
  address: string | null;
  name: string;
  symbol: string;
  decimals: number;
  raw: string;
  formatted: string;
  logoUrl: string | null;
  market: WalletMarketReference | null;
};

export type WalletPayload = {
  walletAddress: string;
  native: WalletAsset;
  portfolio: WalletAsset[] | null;
};

export type ApiErrorBody = {
  error: { code: string; message: string; requestId?: string };
};

export function initialsFor(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

export function shortAddress(address: string | null | undefined) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Wallet unavailable";
}
