/** DEVELOPMENT / UI MOCK DATA — replace with real services in a later phase. */

export type PairType = "Native" | "Stock Pair";
export type PostKind = "thought" | "token" | "position" | "launch" | "image";

export type User = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  accent: string;
  bio: string;
  followers: string;
  following: string;
  verified?: boolean;
};

export type Token = {
  id: string;
  address: string;
  name: string;
  symbol: string;
  pair: string;
  pairType: PairType;
  price: string;
  change: number;
  volume: string;
  marketCap: string;
  phase: "Bonding" | "Live";
  bonding: number;
  creatorId: string;
  spark: number[];
};

export type Position = {
  id: string;
  tokenId: string;
  entry: string;
  current: string;
  pnl: number;
};

export type Launch = {
  id: string;
  tokenId: string;
  creatorId: string;
  createdAt: string;
};

export type Post = {
  id: string;
  userId: string;
  body: string;
  timestamp: string;
  kind: PostKind;
  tokenId?: string;
  positionId?: string;
  launchId?: string;
  comments: number;
  reposts: number;
  likes: number;
  liked?: boolean;
};

export type Notification = {
  id: string;
  userId: string;
  type: "like" | "repost" | "follow" | "reply" | "mention";
  copy: string;
  timestamp: string;
  unread: boolean;
};

export const users: User[] = [
  {
    id: "ari",
    name: "Ari Vale",
    handle: "ari",
    initials: "AV",
    accent: "#2e3235",
    bio: "Finding momentum before it becomes consensus.",
    followers: "12.8K",
    following: "482",
    verified: true,
  },
  {
    id: "maya",
    name: "Maya Lin",
    handle: "mayamoves",
    initials: "ML",
    accent: "#6f777b",
    bio: "Markets, design, and the stories moving both.",
    followers: "8.4K",
    following: "311",
  },
  {
    id: "juno",
    name: "Juno Park",
    handle: "junopark",
    initials: "JP",
    accent: "#b4d105",
    bio: "Launching small ideas with large communities.",
    followers: "24.1K",
    following: "906",
    verified: true,
  },
  {
    id: "sol",
    name: "Sol Mercer",
    handle: "solreads",
    initials: "SM",
    accent: "#91999e",
    bio: "Charts are context. People are the signal.",
    followers: "5.7K",
    following: "247",
  },
  {
    id: "you",
    name: "Nova Reed",
    handle: "novareed",
    initials: "NR",
    accent: "#232628",
    bio: "Exploring the social side of markets.",
    followers: "1,284",
    following: "356",
  },
];

export const tokens: Token[] = [
  {
    id: "chill",
    address: "0x71a9b8c3d4e5f60718293a4b5c6d7e8f9012abcd",
    name: "Chill",
    symbol: "CHILL",
    pair: "ETH",
    pairType: "Native",
    price: "$0.00283",
    change: 18.4,
    volume: "$482K",
    marketCap: "$1.84M",
    phase: "Bonding",
    bonding: 72,
    creatorId: "ari",
    spark: [18, 20, 19, 25, 23, 31, 29, 42, 39, 52, 48, 64, 62, 78],
  },
  {
    id: "side",
    address: "0x4de71ba890cdef1234567890abcedf1234567890",
    name: "Side",
    symbol: "SIDE",
    pair: "NVDA",
    pairType: "Stock Pair",
    price: "$0.0142",
    change: 12.7,
    volume: "$228K",
    marketCap: "$914K",
    phase: "Live",
    bonding: 100,
    creatorId: "juno",
    spark: [22, 27, 24, 30, 36, 33, 39, 45, 43, 49, 55, 52, 61, 67],
  },
  {
    id: "volt",
    address: "0x93bc19f0e12a34567890bcdef1234567890abcd1",
    name: "Volt",
    symbol: "VOLT",
    pair: "TSLA",
    pairType: "Stock Pair",
    price: "$0.00691",
    change: 7.9,
    volume: "$164K",
    marketCap: "$620K",
    phase: "Bonding",
    bonding: 46,
    creatorId: "maya",
    spark: [26, 25, 28, 31, 29, 35, 34, 40, 39, 45, 43, 50, 48, 54],
  },
  {
    id: "orchard",
    address: "0x12f3e4567890abcdef1234567890abcdef123456",
    name: "Orchard",
    symbol: "ORCH",
    pair: "AAPL",
    pairType: "Stock Pair",
    price: "$0.00416",
    change: -3.2,
    volume: "$91K",
    marketCap: "$405K",
    phase: "Live",
    bonding: 100,
    creatorId: "sol",
    spark: [62, 59, 61, 56, 58, 52, 54, 48, 51, 46, 48, 43, 45, 41],
  },
];

export const positions: Position[] = [
  { id: "chill-position", tokenId: "chill", entry: "$0.00240", current: "$0.00283", pnl: 17.9 },
];

export const launches: Launch[] = [
  { id: "side-launch", tokenId: "side", creatorId: "juno", createdAt: "18m" },
  { id: "volt-launch", tokenId: "volt", creatorId: "maya", createdAt: "2h" },
];

export const posts: Post[] = [
  {
    id: "market-waking",
    userId: "ari",
    body: "Watching $CHILL here. Volume is finally waking up.",
    timestamp: "4m",
    kind: "thought",
    comments: 28,
    reposts: 74,
    likes: 391,
  },
  {
    id: "chill-token",
    userId: "maya",
    body: "This is getting interesting.",
    timestamp: "11m",
    kind: "token",
    tokenId: "chill",
    comments: 19,
    reposts: 41,
    likes: 226,
    liked: true,
  },
  {
    id: "opened-chill",
    userId: "sol",
    body: "Opened $CHILL. The conversation caught up to the chart.",
    timestamp: "16m",
    kind: "position",
    positionId: "chill-position",
    comments: 14,
    reposts: 23,
    likes: 148,
  },
  {
    id: "side-live",
    userId: "juno",
    body: "launched $SIDE",
    timestamp: "18m",
    kind: "launch",
    launchId: "side-launch",
    comments: 46,
    reposts: 118,
    likes: 642,
  },
  {
    id: "market-structure",
    userId: "ari",
    body: "Clean structure on the four-hour. Watching how people respond around the next level.",
    timestamp: "31m",
    kind: "image",
    tokenId: "chill",
    comments: 37,
    reposts: 62,
    likes: 318,
  },
];

export const notifications: Notification[] = [
  { id: "n1", userId: "maya", type: "like", copy: "liked your post about $CHILL", timestamp: "2m", unread: true },
  { id: "n2", userId: "juno", type: "repost", copy: "reposted your market note", timestamp: "18m", unread: true },
  { id: "n3", userId: "sol", type: "follow", copy: "followed you", timestamp: "1h", unread: false },
  { id: "n4", userId: "ari", type: "reply", copy: "replied: “That volume shift is the signal.”", timestamp: "3h", unread: false },
  { id: "n5", userId: "maya", type: "mention", copy: "mentioned you in a discussion about $VOLT", timestamp: "7h", unread: false },
];

export const currentUser = users.find((user) => user.id === "you")!;

export function getUser(id: string) {
  return users.find((user) => user.id === id) ?? users[0];
}

export function getUserByHandle(handle: string) {
  return users.find((user) => user.handle === handle) ?? users[0];
}

export function getToken(id: string) {
  return tokens.find((token) => token.id === id) ?? tokens[0];
}

export function getTokenByAddress(address: string) {
  return tokens.find((token) => token.address === address) ?? tokens[0];
}

export function getPost(id: string) {
  return posts.find((post) => post.id === id) ?? posts[0];
}
