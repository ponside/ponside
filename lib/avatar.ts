const X_IMAGE_HOSTS = new Set(["pbs.twimg.com", "abs.twimg.com"]);

const X_THUMBNAIL_SUFFIX = /_(?:normal|bigger|mini|200x200|400x400)(?=\.[^./]+$)/i;

export function highQualityAvatarUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (X_IMAGE_HOSTS.has(url.hostname.toLowerCase())) {
      url.protocol = "https:";
      url.pathname = url.pathname.replace(X_THUMBNAIL_SUFFIX, "");
    }
    return url.toString();
  } catch {
    return null;
  }
}
