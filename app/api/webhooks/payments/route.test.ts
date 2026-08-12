import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookLog: {
      create: vi.fn().mockResolvedValue({ id: "log_1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    eventRegistration: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

vi.mock("@/lib/payment-confirmations", () => ({
  confirmCompanyPaymentCore: vi
    .fn()
    .mockResolvedValue({ success: true, data: { companyId: "company_1" } }),
  confirmEventRegistrationPaymentCore: vi
    .fn()
    .mockResolvedValue({ success: true, data: undefined }),
  confirmCreditPurchaseCore: vi.fn().mockResolvedValue({ success: true, data: undefined }),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import {
  confirmCompanyPaymentCore,
  confirmCreditPurchaseCore,
  confirmEventRegistrationPaymentCore,
} from "@/lib/payment-confirmations";

const SECRET = "test-payment-secret";

function sign(body: string) {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function makeRequest(body: string, signature: string | null) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature !== null) headers.set("X-Webhook-Signature", signature);
  return new Request("http://localhost/api/webhooks/payments", { method: "POST", headers, body });
}

describe("POST /api/webhooks/payments", () => {
  beforeEach(() => {
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
    vi.clearAllMocks();
    vi.mocked(prisma.webhookLog.create).mockResolvedValue({ id: "log_1" } as never);
    vi.mocked(prisma.eventRegistration.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(confirmCompanyPaymentCore).mockResolvedValue({
      success: true,
      data: { companyId: "company_1" },
    });
    vi.mocked(confirmEventRegistrationPaymentCore).mockResolvedValue({
      success: true,
      data: undefined,
    });
    vi.mocked(confirmCreditPurchaseCore).mockResolvedValue({ success: true, data: undefined });
  });

  it("rejects a request with an invalid signature", async () => {
    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
    });
    const res = await POST(makeRequest(body, "deadbeef"));
    expect(res.status).toBe(401);
    expect(prisma.webhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED_INVALID_SIGNATURE" }),
      })
    );
    expect(confirmCompanyPaymentCore).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature header", async () => {
    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
    });
    const res = await POST(makeRequest(body, null));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid payload shape", async () => {
    const body = JSON.stringify({ event: "payment.confirmed" }); // missing type/reference
    const res = await POST(makeRequest(body, sign(body)));
    expect(res.status).toBe(422);
    expect(prisma.webhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) })
    );
  });

  it("dispatches a confirmed company_payment to confirmCompanyPaymentCore with actorId null", async () => {
    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(confirmCompanyPaymentCore).toHaveBeenCalledWith("payment_1", null);
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log_1" },
        data: expect.objectContaining({ status: "PROCESSED" }),
      })
    );
  });

  it("dispatches a confirmed event_registration to confirmEventRegistrationPaymentCore with actorId null", async () => {
    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "event_registration",
      reference: "reg_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(confirmEventRegistrationPaymentCore).toHaveBeenCalledWith("reg_1", null);
  });

  it("dispatches a confirmed credit_purchase to confirmCreditPurchaseCore with actorId null", async () => {
    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "credit_purchase",
      reference: "cp_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(confirmCreditPurchaseCore).toHaveBeenCalledWith("cp_1", null);
  });

  it("returns 409 and logs the failure when the referenced record was already processed", async () => {
    vi.mocked(confirmCompanyPaymentCore).mockResolvedValue({
      success: false,
      error: "Ce paiement a déjà été traité.",
    });

    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(409);
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          error: "Ce paiement a déjà été traité.",
        }),
      })
    );
  });

  it("marks an event registration as FAILED on payment.failed", async () => {
    const body = JSON.stringify({
      event: "payment.failed",
      type: "event_registration",
      reference: "reg_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(prisma.eventRegistration.updateMany).toHaveBeenCalledWith({
      where: { id: "reg_1", paymentStatus: "PENDING" },
      data: { paymentStatus: "FAILED" },
    });
    expect(confirmEventRegistrationPaymentCore).not.toHaveBeenCalled();
  });

  it("returns 409 when payment.failed targets an unknown or already-resolved registration", async () => {
    vi.mocked(prisma.eventRegistration.updateMany).mockResolvedValue({ count: 0 } as never);

    const body = JSON.stringify({
      event: "payment.failed",
      type: "event_registration",
      reference: "reg_x",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(409);
  });

  it("accepts payment.failed for company_payment/credit_purchase without a dedicated status (no enum value exists)", async () => {
    const body = JSON.stringify({
      event: "payment.failed",
      type: "company_payment",
      reference: "payment_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(confirmCompanyPaymentCore).not.toHaveBeenCalled();
  });
});
