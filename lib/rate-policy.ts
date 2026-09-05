export const RATE_LIMITS = {
  post: { limit: 12, windowSeconds: 60 },
  reply: { limit: 20, windowSeconds: 60 },
  social: { limit: 60, windowSeconds: 60 },
  upload: { limit: 12, windowSeconds: 300 },
  transaction: { limit: 20, windowSeconds: 60 },
  quote: { limit: 120, windowSeconds: 60 },
  profile: { limit: 10, windowSeconds: 300 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;
