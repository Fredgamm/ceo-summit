import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis", () => ({ getRedisClient: vi.fn(() => redisMock) }));

const redisMock = { set: vi.fn(), del: vi.fn() };

import { withRedisLock, LockBusyError } from "./redis-lock";

describe("withRedisLock", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
