import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));

import { checkRateLimit } from "@/lib/rate-limit";
import { checkUploadRateLimit } from "./upload-rate-limit";

describe("checkUploadRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the upload through under the limit, keyed by user", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    expect(await checkUploadRateLimit("user_1")).toBeNull();
    expect(checkRateLimit).toHaveBeenCalledWith("upload:user_1", 30, 3600);
  });

  it("answers 429 with Retry-After once the limit is reached", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 120 });
    const res = await checkUploadRateLimit("user_1");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("120");
  });
});
