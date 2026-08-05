import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis", () => ({ getRedisClient: vi.fn(() => redisMock) }));

const redisMock = { incr: vi.fn(), pexpire: vi.fn(), pttl: vi.fn() };

import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    process.env.REDIS_URL = originalRedisUrl;
    vi.useRealTimers();
  });

  describe("with REDIS_URL set", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      process.env.REDIS_URL = "redis://localhost:6379";
    });

    it("allows the first request and sets the window TTL", async () => {
      redisMock.incr.mockResolvedValue(1);

      const result = await checkRateLimit("login:jp@example.com", 5, 60);

      expect(result).toEqual({ allowed: true, retryAfterSec: 0 });
      expect(redisMock.pexpire).toHaveBeenCalledWith("ratelimit:login:jp@example.com", 60_000);
    });

    it("does not reset the TTL on subsequent requests within the window", async () => {
      redisMock.incr.mockResolvedValue(2);

      await checkRateLimit("login:jp@example.com", 5, 60);

      expect(redisMock.pexpire).not.toHaveBeenCalled();
    });

    it("rejects once the limit is exceeded, reporting retryAfterSec from the TTL", async () => {
      redisMock.incr.mockResolvedValue(6);
      redisMock.pttl.mockResolvedValue(30_000);

      const result = await checkRateLimit("login:jp@example.com", 5, 60);

      expect(result).toEqual({ allowed: false, retryAfterSec: 30 });
    });
  });

  describe("without REDIS_URL (in-memory fallback)", () => {
    beforeEach(() => {
      delete process.env.REDIS_URL;
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    });

    it("allows requests up to the limit then rejects", async () => {
      const key = `test:${Math.random()}`;
      for (let i = 0; i < 3; i++) {
        expect(await checkRateLimit(key, 3, 60)).toEqual({ allowed: true, retryAfterSec: 0 });
      }

      const result = await checkRateLimit(key, 3, 60);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSec).toBeGreaterThan(0);
    });

    it("resets the count once the window has elapsed", async () => {
      const key = `test:${Math.random()}`;
      await checkRateLimit(key, 1, 60);
      expect((await checkRateLimit(key, 1, 60)).allowed).toBe(false);

      vi.setSystemTime(new Date("2027-01-01T00:01:01Z"));

      expect((await checkRateLimit(key, 1, 60)).allowed).toBe(true);
    });
  });
});
