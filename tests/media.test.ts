import { describe, expect, it } from "vitest";
import { extensionMatchesMime, matchesImageSignature } from "../lib/media";

describe("upload signature checks", () => {
  it("accepts matching PNG and JPEG signatures", () => {
    expect(matchesImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(matchesImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe(true);
  });

  it("rejects a MIME type that does not match the bytes", () => {
    expect(matchesImageSignature(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "image/png")).toBe(false);
  });

  it("requires a matching filename extension", () => {
    expect(extensionMatchesMime("photo.JPEG", "image/jpeg")).toBe(true);
    expect(extensionMatchesMime("photo.html", "image/jpeg")).toBe(false);
  });
});
