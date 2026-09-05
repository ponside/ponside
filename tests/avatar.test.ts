import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { highQualityAvatarUrl } from "../lib/avatar";

describe("X profile avatars", () => {
  it("uses the original X image while preserving query parameters", () => {
    expect(highQualityAvatarUrl("https://pbs.twimg.com/profile_images/123/photo_normal.jpg?name=small&v=2"))
      .toBe("https://pbs.twimg.com/profile_images/123/photo.jpg?name=small&v=2");
  });

  it("does not rewrite thumbnail-like names on unrelated hosts", () => {
    expect(highQualityAvatarUrl("https://images.example.com/photo_normal.jpg?x=1"))
      .toBe("https://images.example.com/photo_normal.jpg?x=1");
  });

  it("rejects invalid or non-web image URLs", () => {
    expect(highQualityAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(highQualityAvatarUrl("not a URL")).toBeNull();
  });

  it("renders either the image or fallback text, never both", () => {
    const component = readFileSync("components/product/primitives.tsx", "utf8");
    expect(component).not.toContain("backgroundImage");
    expect(component).toContain("showImage && avatarUrl");
    expect(component).toContain("onError={() => setFailedUrl(avatarUrl)}");
  });

  it("refreshes the stored avatar from the current Privy X identity", () => {
    const auth = readFileSync("lib/server/auth.ts", "utf8");
    expect(auth).toContain("avatar_url: highQualityAvatarUrl(twitter.profile_picture_url)");
    expect(auth).toContain("avatar_url: row.avatar_url");
  });
});
