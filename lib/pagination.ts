const cursorPattern = /^([A-Za-z0-9_-]+)$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type FeedCursor = { createdAt: string; id: string };

export function createFeedCursor(cursor: FeedCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function parseFeedCursor(value: string | null | undefined): FeedCursor | null {
  if (!value) return null;
  if (value.length > 256 || !cursorPattern.test(value)) throw new Error("Invalid feed cursor.");
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid feed cursor.");
  }
  if (!decoded || typeof decoded !== "object") throw new Error("Invalid feed cursor.");
  const { createdAt, id } = decoded as Record<string, unknown>;
  if (typeof createdAt !== "string" || typeof id !== "string" || !uuidPattern.test(id)) throw new Error("Invalid feed cursor.");
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid feed cursor.");
  return { createdAt: date.toISOString(), id: id.toLowerCase() };
}
