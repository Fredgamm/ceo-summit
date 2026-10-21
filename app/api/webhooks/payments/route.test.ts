import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // Aucune configuration saisie dans /admin/parametres : repli sur les variables d'environnement.
    platformSetting: { findMany: async () => [] },
    webhookLog: {
      create: vi.fn().mockResolvedValue({ id: "log_1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    eventRegistration: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    companyPayment: {
      findUnique: vi.fn().mockResolvedValue(null),
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
  reviveCancelledEvoliaPayment: vi.fn().mockResolvedValue("none"),
  cancelPendingEvoliaPaymentCore: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSec: 0 }),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import {
  cancelPendingEvoliaPaymentCore,
  confirmCompanyPaymentCore,
  confirmEventRegistrationPaymentCore,
  reviveCancelledEvoliaPayment,
} from "@/lib/payment-confirmations";
import { checkRateLimit } from "@/lib/rate-limit";
import { FAILED_AT_EVOLIA_REASON } from "@/lib/payment-methods";

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
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(null as never);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, retryAfterSec: 0 });
    vi.mocked(reviveCancelledEvoliaPayment).mockResolvedValue("none");
    vi.mocked(confirmCompanyPaymentCore).mockResolvedValue({
      success: true,
      data: { companyId: "company_1" },
    });
    vi.mocked(confirmEventRegistrationPaymentCore).mockResolvedValue({
      success: true,
      data: undefined,
    });
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

  it("honours a payment the company cancelled but paid anyway at Evolia", async () => {
    vi.mocked(reviveCancelledEvoliaPayment).mockResolvedValue("revived");
    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
    });

    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(confirmCompanyPaymentCore).toHaveBeenCalledWith("payment_1", null);
  });

  it("does not reactivate anything for a double payment, only flags it", async () => {
    vi.mocked(reviveCancelledEvoliaPayment).mockResolvedValue("already-paid");
    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
    });

    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(confirmCompanyPaymentCore).not.toHaveBeenCalled();
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ error: expect.stringContaining("double paiement") }),
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

  it("rejects the retired credit_purchase type as an invalid payload", async () => {
    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "credit_purchase",
      reference: "cp_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(422);
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

  it("cancels a pending card payment on payment.failed, giving the payment step back", async () => {
    const pendingPayment = {
      id: "payment_1",
      status: "PENDING",
      method: "CARTE_BANCAIRE",
      upsellQuantity: null,
      companySubscriptionId: "sub_1",
    };
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValueOnce(pendingPayment as never);
    const body = JSON.stringify({
      event: "payment.failed",
      type: "company_payment",
      reference: "payment_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(cancelPendingEvoliaPaymentCore).toHaveBeenCalledWith(
      pendingPayment,
      FAILED_AT_EVOLIA_REASON,
      null
    );
    expect(confirmCompanyPaymentCore).not.toHaveBeenCalled();
  });

  it("returns 409 when payment.failed targets an unknown or already-resolved company payment", async () => {
    const body = JSON.stringify({
      event: "payment.failed",
      type: "company_payment",
      reference: "payment_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(409);
    expect(cancelPendingEvoliaPaymentCore).not.toHaveBeenCalled();
  });

  it("rejects with 429 when the per-IP rate limit is exceeded, before touching the database", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSec: 30 });

    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(429);
    expect(prisma.webhookLog.create).not.toHaveBeenCalled();
    expect(confirmCompanyPaymentCore).not.toHaveBeenCalled();
  });

  it("still confirms but logs a warning when the confirmed amount differs from the amount due", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue({ amount: 2500000 } as never);

    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
      amount: 1,
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(confirmCompanyPaymentCore).toHaveBeenCalledWith("payment_1", null);
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PROCESSED",
          error: expect.stringContaining("Montant confirmé"),
        }),
      })
    );
  });

  it("confirms without a warning when the confirmed amount matches the amount due", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue({ amount: 2500000 } as never);

    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
      amount: 2500000,
    });
    const res = await POST(makeRequest(body, sign(body)));

    expect(res.status).toBe(200);
    expect(prisma.webhookLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROCESSED", error: null }),
      })
    );
  });

  describe("optional X-Webhook-Timestamp (anti-replay)", () => {
    const body = JSON.stringify({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
    });

    function makeTimestampedRequest(signature: string, timestamp: string) {
      const req = makeRequest(body, signature);
      req.headers.set("X-Webhook-Timestamp", timestamp);
      return req;
    }

    it("accepts a fresh timestamp signed together with the body", async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const res = await POST(makeTimestampedRequest(sign(`${ts}.${body}`), ts));
      expect(res.status).toBe(200);
      expect(confirmCompanyPaymentCore).toHaveBeenCalledWith("payment_1", null);
    });

    it("rejects a timestamp older than 5 minutes (replay)", async () => {
      const ts = String(Math.floor(Date.now() / 1000) - 6 * 60);
      const res = await POST(makeTimestampedRequest(sign(`${ts}.${body}`), ts));
      expect(res.status).toBe(401);
      expect(confirmCompanyPaymentCore).not.toHaveBeenCalled();
      expect(prisma.webhookLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ error: "X-Webhook-Timestamp outside tolerance" }),
        })
      );
    });

    it("rejects a timestamped request signed over the body alone", async () => {
      const ts = String(Math.floor(Date.now() / 1000));
      const res = await POST(makeTimestampedRequest(sign(body), ts));
      expect(res.status).toBe(401);
    });

    it("rejects a non-numeric timestamp", async () => {
      const res = await POST(makeTimestampedRequest(sign(`abc.${body}`), "abc"));
      expect(res.status).toBe(401);
    });

    it("keeps accepting requests without the header (backward compatible)", async () => {
      const res = await POST(makeRequest(body, sign(body)));
      expect(res.status).toBe(200);
    });
  });
});
