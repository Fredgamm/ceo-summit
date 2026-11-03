import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meeting-expiry", () => ({ expireDueMeetings: vi.fn() }));

import { expireDueMeetings } from "@/lib/meeting-expiry";
import { POST } from "./route";

const SECRET = "s".repeat(40);
const call = (authorization?: string) =>
  POST(
    new Request("http://localhost/api/webhooks/meeting-expiry", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    })
  );

describe("POST /api/webhooks/meeting-expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(expireDueMeetings).mockResolvedValue([
      { id: "b1", requesterId: "a", recipientId: "b" },
    ]);
    process.env.MEETING_CRON_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.MEETING_CRON_SECRET;
  });

  it("expires the due requests when the secret matches", async () => {
    const res = await call(`Bearer ${SECRET}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ expired: 1 });
    expect(expireDueMeetings).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing or wrong secret without touching anything", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect((await call(`Bearer ${SECRET}x`)).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401);
    expect(expireDueMeetings).not.toHaveBeenCalled();
  });

  it("stays closed (503) when no secret is configured, or a too-short one", async () => {
    delete process.env.MEETING_CRON_SECRET;
    expect((await call("Bearer ")).status).toBe(503);

    process.env.MEETING_CRON_SECRET = "short";
    expect((await call("Bearer short")).status).toBe(503);
    expect(expireDueMeetings).not.toHaveBeenCalled();
  });
});
