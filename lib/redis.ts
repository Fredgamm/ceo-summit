import Redis from "ioredis";

/**
 * Redis singleton (cache + distributed locks). Ref: CEO_Summit_Architecture_Technique.docx
 *   "Cache / Temps réel — Redis 7"
 * Lazily instantiated like lib/resend.ts / lib/r2.ts — no crash at import
 * time in environments without REDIS_URL set.
 */
let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set — see .env.example");
    }
    client = new Redis(url);
  }
  return client;
}
