import { describe, expect, it } from "vitest";
import { createFeedCursor, parseFeedCursor } from "../lib/pagination";

describe("feed pagination cursor", () => {
  it("round-trips a deterministic timestamp and id cursor", () => {
    const cursor = createFeedCursor({ createdAt: "2026-09-03T10:00:00Z", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    expect(parseFeedCursor(cursor)).toEqual({ createdAt: "2026-09-03T10:00:00.000Z", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  });

  it("rejects an invalid cursor instead of changing query meaning", () => {
    expect(() => parseFeedCursor("not-a-cursor")).toThrow("Invalid feed cursor");
  });
});
