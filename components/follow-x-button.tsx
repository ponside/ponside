import { SITE_CONFIG } from "@/lib/config";

function XIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      width="16"
      height="16"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

export function FollowXButton() {
  return (
    <a
      className="follow-button"
      href={SITE_CONFIG.X_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Follow Ponside on X"
    >
      <span className="button-sheen" aria-hidden="true" />
      <XIcon />
      <span>Follow on X</span>
      <span className="button-accent" aria-hidden="true" />
    </a>
  );
}
