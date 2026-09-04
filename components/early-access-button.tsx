import { SITE_CONFIG } from "@/lib/config";

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      width="16"
      height="16"
    >
      <path
        d="M5.5 14.5 14.5 5.5M8 5.5h6.5V12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function EarlyAccessButton() {
  return (
    <a
      className="early-button"
      href={SITE_CONFIG.EARLY_ACCESS_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open Ponside early access form"
    >
      <span className="early-button-sheen" aria-hidden="true" />
      <span>Early access</span>
      <span className="early-button-icon" aria-hidden="true">
        <ArrowIcon />
      </span>
    </a>
  );
}
