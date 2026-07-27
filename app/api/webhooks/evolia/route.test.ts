import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route handlers in the App Router are plain (Request) => Response
 * functions — calling POST() directly is the standard way to unit-test them
 * (see Next.js testing docs) and avoids the overhead of booting a real HTTP
 * server just to drive Supertest at it, which is what the E1-T02 acceptance
 * criteria ("tests Supertest sur webhook valide/invalide/doublon") actually
 * needs covered: valid payload, invalid signature, duplicate payment.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookLog: {
      create: vi.fn().mockResolvedValue({ id: "log_1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    },
    creditBalance: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    activationToken: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/lib/resend", () => ({
  sendTransactionalEmail: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/emails/activation-email", () => ({
  default: vi.fn(() => null),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";

const SECRET = "test-evolia-secret";

function sign(body: string) {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function makeRequest(body: string, signature: string | null) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature !== null) headers.set("X-Evolia-Signature", signature);
  return new Request("http://localhost/api/webhooks/evolia", {
    method: "POST",
    headers,
    body,
  });
}

const validPayload = {
  event: "payment.confirmed" as const,
  member: { name: "Marie Dupont", email: "marie@example.com", phone: "+261340000000" },
  subscription: {
    tier: "executive" as const,
    startDate: "2026-08-01T00:00:00.000Z",
    endDate: "2027-07-31T00:00:00.000Z",
  },
  payment: { amount: 500000, reference: "EVL-2026-0001", date: "2026-07-27" },
};

describe("POST /api/webhooks/evolia", () => {
  beforeEach(() => {
    process.env.EVOLIA_WEBHOOK_SECRET = SECRET;
    process.env.NEXTAUTH_URL = "https://app.ceosummit.mg";
    vi.clearAllMocks();
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  });

  it("rejects a request with an invalid HMAC signature", async () => {
    const body = JSON.stringify(validPayload);
    const res = await POST(makeRequest(body, "0".repeat(64)));

    expect(res.status).toBe(401);
    expect(prisma.webhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED_INVALID_SIGNATURE" }) })
    );
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it("rejects a request missing the signature header", async () => {
    const body = JSON.stringify(validPayload);
    const res = await POST(makeRequest(body, null));

    expect(res.status).toBe(401);
  });

  it("rejects a well-signed but malformed payload", async () => {
    const body = JSON.stringify({ event: "payment.confirmed" }); // missing member/subscription/payment
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(422);
    expect(prisma.webhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("creates the user, membership and sends the activation email for a new member", async () => {
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: "user_1",
      email: "marie@example.com",
      name: "Marie Dupont",
    } as never);

    const body = JSON.stringify(validPayload);
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: "EXECUTIVE", status: "PENDING_ACTIVATION" }),
      })
    );
    expect(prisma.membership.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentRef: "EVL-2026-0001", tier: "EXECUTIVE" }) })
    );
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) })
    );
  });

  it("updates role/status but sends no activation email when the member already has an account (renewal)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "user_1", status: "EXPIRED" } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: "user_1",
      email: "marie@example.com",
      name: "Marie Dupont",
    } as never);

    const body = JSON.stringify(validPayload);
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ role: "EXECUTIVE", status: "ACTIVE" }) })
    );
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("ignores a duplicate payment reference instead of creating a second Membership (idempotence)", async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: "membership_existing",
      paymentRef: "EVL-2026-0001",
    } as never);

    const body = JSON.stringify(validPayload);
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.membership.create).not.toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) })
    );
  });
});
