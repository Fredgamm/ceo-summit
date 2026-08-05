import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis", () => ({ getRedisClient: vi.fn(() => redisMock) }));

const redisMock = { set: vi.fn(), del: vi.fn() };

import { withRedisLock, LockBusyError } from "./redis-lock";

describe("withRedisLock", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterEach(() => {
    process.env.REDIS_URL = originalRedisUrl;
  });

  it("runs the callback and releases the lock when acquisition succeeds", async () => {
    redisMock.set.mockResolvedValue("OK");
    const fn = vi.fn().mockResolvedValue("result");

    const result = await withRedisLock("lock:x", fn, 3000);

    expect(result).toBe("result");
    expect(redisMock.set).toHaveBeenCalledWith("lock:x", expect.any(String), "PX", 3000, "NX");
    expect(redisMock.del).toHaveBeenCalledWith("lock:x");
  });

  it("throws LockBusyError without running the callback when already held", async () => {
    redisMock.set.mockResolvedValue(null);
    const fn = vi.fn();

    await expect(withRedisLock("lock:x", fn)).rejects.toBeInstanceOf(LockBusyError);
    expect(fn).not.toHaveBeenCalled();
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it("releases the lock even if the callback throws", async () => {
    redisMock.set.mockResolvedValue("OK");
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(withRedisLock("lock:x", fn)).rejects.toThrow("boom");
    expect(redisMock.del).toHaveBeenCalledWith("lock:x");
  });

  it("defaults to a 5000ms TTL", async () => {
    redisMock.set.mockResolvedValue("OK");
    await withRedisLock("lock:x", async () => "ok");
    expect(redisMock.set).toHaveBeenCalledWith("lock:x", expect.any(String), "PX", 5000, "NX");
  });

  it("degrades to a no-op (runs the callback without locking) when REDIS_URL is not set", async () => {
    delete process.env.REDIS_URL;
    const fn = vi.fn().mockResolvedValue("result");

    const result = await withRedisLock("lock:x", fn);

    expect(result).toBe("result");
    expect(redisMock.set).not.toHaveBeenCalled();
    expect(redisMock.del).not.toHaveBeenCalled();
  });
});
