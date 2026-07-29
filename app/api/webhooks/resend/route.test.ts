import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookLog: {
      create: vi.fn().mockResolvedValue({ id: "log_1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    broadcastRecipient: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    broadcast: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";

const SECRET = "test-resend-secret";

function sign(body: string) {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function makeRequest(body: string, signature: string | null) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature !== null) headers.set("X-Resend-Signature", signature);
  return new Request("http://localhost/api/webhooks/resend", { method: "POST", headers, body });
}

const openedPayload = {
  type: "email.opened" as const,
  created_at: "2026-07-29T10:00:00.000Z",
  data: { email_id: "resend_msg_1" },
};

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    vi.clearAllMocks();
  });

  it("rejects a request with an invalid signature", async () => {
    const body = JSON.stringify(openedPayload);
    const res = await POST(makeRequest(body, "deadbeef"));
    expect(res.status).toBe(401);
    expect(prisma.webhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED_INVALID_SIGNATURE" }),
      })
    );
  });

  it("rejects a request with no signature header", async () => {
    const body = JSON.stringify(openedPayload);
    const res = await POST(makeRequest(body, null));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid payload shape", async () => {
    const body = JSON.stringify({ type: "email.opened" }); // missing data.email_id
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(422);
  });

  it("marks the recipient as opened and increments the broadcast's open count", async () => {
    vi.mocked(prisma.broadcastRecipient.findFirst).mockResolvedValue({
      id: "recipient_1",
      broadcastId: "broadcast_1",
      openedAt: null,
    } as never);

    const body = JSON.stringify(openedPayload);
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(prisma.broadcastRecipient.update).toHaveBeenCalledWith({
      where: { id: "recipient_1" },
      data: { openedAt: expect.any(Date) },
    });
    expect(prisma.broadcast.update).toHaveBeenCalledWith({
      where: { id: "broadcast_1" },
      data: { openCount: { increment: 1 } },
    });
  });

  it("is idempotent — a second open event for the same recipient doesn't double-count", async () => {
    vi.mocked(prisma.broadcastRecipient.findFirst).mockResolvedValue({
      id: "recipient_1",
      broadcastId: "broadcast_1",
      openedAt: new Date("2026-07-29T09:00:00.000Z"),
    } as never);

    const body = JSON.stringify(openedPayload);
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(prisma.broadcastRecipient.update).not.toHaveBeenCalled();
    expect(prisma.broadcast.update).not.toHaveBeenCalled();
  });

  it("ignores an unknown recipient without erroring", async () => {
    vi.mocked(prisma.broadcastRecipient.findFirst).mockResolvedValue(null);

    const body = JSON.stringify(openedPayload);
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(prisma.broadcastRecipient.update).not.toHaveBeenCalled();
  });

  it("logs but takes no action for other event types", async () => {
    const body = JSON.stringify({
      type: "email.delivered",
      created_at: "2026-07-29T10:00:00.000Z",
      data: { email_id: "resend_msg_1" },
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(prisma.broadcastRecipient.findFirst).not.toHaveBeenCalled();
  });
});
