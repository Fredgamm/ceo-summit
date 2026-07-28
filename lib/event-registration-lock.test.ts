import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
  getRedisClient: vi.fn(() => redisMock),
}));

const redisMock = {
  set: vi.fn(),
  del: vi.fn(),
};

import { withEventRegistrationLock, RegistrationLockBusyError } from "./event-registration-lock";

describe("withEventRegistrationLock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the callback and releases the lock when acquisition succeeds", async () => {
    redisMock.set.mockResolvedValue("OK");
    const fn = vi.fn().mockResolvedValue("result");

    const result = await withEventRegistrationLock("event_1", fn);

    expect(result).toBe("result");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(redisMock.set).toHaveBeenCalledWith(
      "lock:event:event_1:register",
      expect.any(String),
      "PX",
      5000,
      "NX"
    );
    expect(redisMock.del).toHaveBeenCalledWith("lock:event:event_1:register");
  });

  it("throws without running the callback when the lock is already held", async () => {
    redisMock.set.mockResolvedValue(null);
    const fn = vi.fn();

    await expect(withEventRegistrationLock("event_1", fn)).rejects.toBeInstanceOf(
      RegistrationLockBusyError
    );
    expect(fn).not.toHaveBeenCalled();
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it("releases the lock even if the callback throws", async () => {
    redisMock.set.mockResolvedValue("OK");
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(withEventRegistrationLock("event_1", fn)).rejects.toThrow("boom");
    expect(redisMock.del).toHaveBeenCalledWith("lock:event:event_1:register");
  });
});
