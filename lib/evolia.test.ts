import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companyPayment: {
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Evolia activé ; aucun autre réglage saisi : repli sur les variables d'environnement.
    platformSetting: {
      findMany: vi.fn(async () => [{ key: "evolia.live", value: "true", updatedAt: new Date() }]),
    },
    company: { findUnique: vi.fn() },
    eventRegistration: { findMany: vi.fn().mockResolvedValue([]) },
    evoliaPush: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({ id: "push_1" }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  confirmPaymentToEvolia,
  deferParticipantPushes,
  deliverEvoliaPush,
  evoliaPaymentUrl,
  flushDeferredParticipantPushes,
  isPendingPaymentRefusal,
  PENDING_PAYMENT_RETRY_DELAYS_MS,
  pushParticipantsToEvolia,
  pushRegistrationToEvolia,
  releaseHeldEvoliaPushes,
  signEvoliaBody,
} from "./evolia";

const EVENT = {
  id: "event_1",
  title: "CEO Summit 2026",
  // 9h00 – 18h30, heure de Madagascar (UTC+3).
  date: new Date("2026-11-15T06:00:00Z"),
  endDate: new Date("2026-11-15T15:30:00Z"),
  timezone: "Indian/Antananarivo",
  isOnline: false,
  location: "Antananarivo",
};

const COMPANY = {
  id: "company_1",
  name: "Rakoto Holding",
  sector: "Banque",
  country: "Madagascar",
  companyAdminId: "manager_1",
  companyAdmin: { id: "manager_1", name: "Marie Dupont", email: "marie@example.mg" },
  subscription: {
    declaredParticipants: null,
    extraSeats: 0,
    memberLimit: null,
    plan: {
      name: "Executive",
      description: "Accès complet",
      eventId: "event_1",
      event: EVENT,
      pricingMode: "FIXED_BUNDLE",
      maxTeamMembers: 3,
    },
  },
};

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment_1",
    method: "CARTE_BANCAIRE",
    amount: 12_500_000,
    upsellQuantity: null,
    upsellPlan: null,
    companySubscription: { company: COMPANY },
    ...overrides,
  };
}

function pushedPayload() {
  const call = vi.mocked(prisma.evoliaPush.create).mock.calls[0][0] as {
    data: { payload: Record<string, unknown>; event: string; reference: string | null };
  };
  return call.data;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("EVOLIA_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("EVOLIA_REGISTRATION_URL", "https://evolia.test/registrations");
  fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
  vi.mocked(prisma.evoliaPush.findUnique).mockImplementation((async () => {
    const created = vi.mocked(prisma.evoliaPush.create).mock.calls[0]?.[0] as
      { data: { payload: unknown } } | undefined;
    return { id: "push_1", payload: created?.data.payload ?? { event: "test" } };
  }) as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("helpers", () => {
  it("builds the payment link from the reference", async () => {
    expect(await evoliaPaymentUrl("pay_1")).toBe("https://event.aiolia.us/ceosummit/payment/pay_1");
  });

  it("signs the raw body with HMAC-SHA256", () => {
    const expected = createHmac("sha256", "s3cret").update('{"a":1}').digest("hex");
    expect(signEvoliaBody('{"a":1}', "s3cret")).toBe(`sha256=${expected}`);
  });
});

describe("pushRegistrationToEvolia", () => {
  it("sends the amount to collect, the event dates and the manager for a card payment", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(payment() as never);

    await pushRegistrationToEvolia("payment_1");

    const data = pushedPayload();
    expect(data.reference).toBe("payment_1");
    expect(data.payload).toMatchObject({
      event: "company.registration.pushed",
      ceoSummitReference: "payment_1",
      paymentMethod: "evolia",
      amountDue: 12_500_000,
      currency: "MGA",
      company: { name: "Rakoto Holding", sector: "Banque", country: "Madagascar" },
      offer: { name: "Executive", includedParticipants: 3 },
      eventDetails: {
        title: "CEO Summit 2026",
        startsAt: "2026-11-15T09:00:00+03:00",
        endsAt: "2026-11-15T18:30:00+03:00",
        timezone: "Indian/Antananarivo",
        location: "Antananarivo",
      },
      participants: [{ fullName: "Marie Dupont", email: "marie@example.mg", isInitiator: true }],
    });
  });

  it("sends no amount for a bank transfer (information only)", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(
      payment({ method: "VIREMENT" }) as never
    );

    await pushRegistrationToEvolia("payment_1");

    expect(pushedPayload().payload).not.toHaveProperty("amountDue");
    expect(pushedPayload().payload).toMatchObject({ paymentMethod: "virement" });
  });

  it("describes only the purchased seats for an upsell", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(
      payment({
        upsellQuantity: 2,
        upsellPlan: { name: "Executive Pass", description: null },
      }) as never
    );

    await pushRegistrationToEvolia("payment_1");

    expect(pushedPayload().payload).toMatchObject({
      offer: { name: "Executive Pass", includedParticipants: 2 },
    });
  });
});

describe("pushParticipantsToEvolia", () => {
  it("sends the confirmed participants with the total capacity", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(COMPANY as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      { user: { id: "manager_1", name: "Marie Dupont", email: "marie@example.mg" } },
      { user: { id: "user_2", name: "Jean Rabe", email: "jean@example.mg" } },
    ] as never);

    vi.mocked(prisma.companyPayment.findFirst).mockResolvedValue({ id: "payment_1" } as never);

    await pushParticipantsToEvolia("company_1");

    expect(pushedPayload().payload).toMatchObject({
      event: "company.participants.confirmed",
      ceoSummitReference: "payment_1",
      offer: { includedParticipants: 3 },
      participants: [
        { fullName: "Marie Dupont", isInitiator: true },
        { fullName: "Jean Rabe", isInitiator: false },
      ],
    });
    expect(pushedPayload().payload).not.toHaveProperty("paymentMethod");
  });
});

describe("liste refusée pour paiement en attente (24 nov. 2026)", () => {
  const PENDING_ERROR =
    '{"error":"Paiement en attente — la liste des participants ne peut pas être validée avant encaissement (référence(s) en attente : payment_1)"}';

  beforeEach(() => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(COMPANY as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      { user: { id: "manager_1", name: "Marie Dupont", email: "marie@example.mg" } },
    ] as never);
    vi.mocked(prisma.companyPayment.findFirst).mockResolvedValue({ id: "payment_1" } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("met la liste de côté pendant un appel différé, sans rien envoyer", async () => {
    const { result, companyIds } = await deferParticipantPushes(async () => {
      await pushParticipantsToEvolia("company_1");
      await pushParticipantsToEvolia("company_1");
      return "ok";
    });

    expect(result).toBe("ok");
    expect(companyIds).toEqual(["company_1"]);
    expect(prisma.evoliaPush.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    await flushDeferredParticipantPushes(companyIds);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renvoie la liste recalculée 30 s après un refus « paiement en attente »", async () => {
    vi.useFakeTimers();
    const failedAt = new Date("2026-11-24T07:06:29Z");
    vi.mocked(prisma.evoliaPush.findUnique).mockImplementation((async (args: {
      select?: unknown;
    }) => {
      if (args.select) return { status: "FAILED", createdAt: failedAt };
      const created = vi.mocked(prisma.evoliaPush.create).mock.calls.at(-1)?.[0] as {
        data: { payload: unknown };
      };
      return { id: "push_1", payload: created.data.payload };
    }) as never);
    vi.mocked(prisma.evoliaPush.findFirst)
      .mockResolvedValueOnce({
        id: "push_1",
        event: "company.participants.confirmed",
        status: "FAILED",
        httpStatus: 409,
        lastError: PENDING_ERROR,
      } as never)
      .mockResolvedValueOnce(null); // aucune liste plus récente reçue entre-temps
    fetchMock
      .mockResolvedValueOnce(new Response(PENDING_ERROR, { status: 409 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    expect(await pushParticipantsToEvolia("company_1")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PENDING_PAYMENT_RETRY_DELAYS_MS[0]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(prisma.evoliaPush.updateMany).toHaveBeenCalledWith({
      where: { id: "push_1", status: "FAILED" },
      data: expect.objectContaining({ status: "SKIPPED" }),
    });
  });

  it("ne réessaie pas un autre refus", async () => {
    vi.useFakeTimers();
    vi.mocked(prisma.evoliaPush.findFirst).mockResolvedValueOnce({
      id: "push_1",
      event: "company.participants.confirmed",
      status: "FAILED",
      httpStatus: 422,
      lastError: '{"error":"Corps de requête invalide"}',
    } as never);
    fetchMock.mockResolvedValueOnce(new Response("invalide", { status: 422 }));

    await pushParticipantsToEvolia("company_1");
    await vi.advanceTimersByTimeAsync(PENDING_PAYMENT_RETRY_DELAYS_MS.at(-1)! * 2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reconnaît le refus « paiement en attente » d'Evolia", () => {
    const push = { event: "company.participants.confirmed", httpStatus: 409 };
    expect(isPendingPaymentRefusal({ ...push, lastError: PENDING_ERROR })).toBe(true);
    expect(isPendingPaymentRefusal({ ...push, lastError: "Conflit" })).toBe(false);
    expect(
      isPendingPaymentRefusal({
        ...push,
        event: "company.registration.pushed",
        lastError: PENDING_ERROR,
      })
    ).toBe(false);
  });
});

describe("deliverEvoliaPush", () => {
  it("posts the signed body and records the success", async () => {
    vi.mocked(prisma.evoliaPush.findUnique).mockResolvedValue({
      id: "push_1",
      payload: { event: "test" },
    } as never);

    expect(await deliverEvoliaPush("push_1")).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://evolia.test/registrations");
    expect(init.headers["X-Webhook-Signature"]).toBe(
      signEvoliaBody('{"event":"test"}', "test-secret")
    );
    expect(prisma.evoliaPush.update).toHaveBeenCalledWith({
      where: { id: "push_1" },
      data: expect.objectContaining({ status: "SENT", httpStatus: 200 }),
    });
  });

  it("records an HTTP error without throwing", async () => {
    fetchMock.mockResolvedValue(new Response("bad signature", { status: 401 }));

    expect(await deliverEvoliaPush("push_1")).toBe(false);
    expect(prisma.evoliaPush.update).toHaveBeenCalledWith({
      where: { id: "push_1" },
      data: expect.objectContaining({
        status: "FAILED",
        httpStatus: 401,
        lastError: "bad signature",
      }),
    });
  });

  it("records a network failure without throwing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("timeout"));

    expect(await deliverEvoliaPush("push_1")).toBe(false);
    expect(prisma.evoliaPush.update).toHaveBeenCalledWith({
      where: { id: "push_1" },
      data: expect.objectContaining({ status: "FAILED", lastError: "timeout" }),
    });
    errorSpy.mockRestore();
  });

  it("does not call Evolia when the secret is missing", async () => {
    vi.stubEnv("EVOLIA_WEBHOOK_SECRET", "");

    expect(await deliverEvoliaPush("push_1")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Evolia constraints", () => {
  function createdPayloads() {
    return vi
      .mocked(prisma.evoliaPush.create)
      .mock.calls.map((c) => (c[0] as { data: { payload: Record<string, unknown> } }).data.payload);
  }

  it("falls back to the manager for an upsell paid before the list is validated", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(
      payment({
        upsellQuantity: 1,
        upsellPlan: { name: "Executive Pass", description: null },
      }) as never
    );
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([]);

    await pushRegistrationToEvolia("payment_1");

    expect(pushedPayload().payload).toMatchObject({
      participants: [{ fullName: "Marie Dupont", isInitiator: true }],
    });
  });

  it("never sends an empty participant list", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(COMPANY as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await pushParticipantsToEvolia("company_1");

    expect(prisma.evoliaPush.create).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("registers a paymentless offer (partner) before its first participant list", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      ...COMPANY,
      subscription: { ...COMPANY.subscription, id: "sub_1" },
    } as never);
    vi.mocked(prisma.companyPayment.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      { user: { id: "manager_1", name: "Marie Dupont", email: "marie@example.mg" } },
    ] as never);

    vi.mocked(prisma.evoliaPush.findMany).mockResolvedValueOnce([]);

    await pushParticipantsToEvolia("company_1");

    const [registration, confirmation, list] = createdPayloads();
    expect(registration).toMatchObject({
      event: "company.registration.pushed",
      ceoSummitReference: "sub_1",
      paymentMethod: "virement",
    });
    expect(registration).not.toHaveProperty("amountDue");
    // 25 nov. 2026 — Evolia refuse la liste tant que le paiement n'est pas confirmé.
    expect(confirmation).toEqual({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "sub_1",
      amount: 0,
    });
    expect(list).toMatchObject({
      event: "company.participants.confirmed",
      ceoSummitReference: "sub_1",
    });
  });

  it("does not register the partner twice", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      ...COMPANY,
      subscription: { ...COMPANY.subscription, id: "sub_1" },
    } as never);
    vi.mocked(prisma.evoliaPush.findFirst).mockResolvedValue({ id: "push_old" } as never);
    vi.mocked(prisma.evoliaPush.findMany).mockResolvedValueOnce([{ reference: "sub_1" }] as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      { user: { id: "manager_1", name: "Marie Dupont", email: "marie@example.mg" } },
    ] as never);

    await pushParticipantsToEvolia("company_1");

    expect(createdPayloads().map((p) => p.event)).toEqual(["company.participants.confirmed"]);
  });

  it("confirme un virement pas encore confirmé avant d'envoyer la liste (25 nov. 2026)", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue({
      ...COMPANY,
      subscription: { ...COMPANY.subscription, id: "sub_1" },
    } as never);
    vi.mocked(prisma.companyPayment.findFirst).mockResolvedValue({ id: "payment_1" } as never);
    vi.mocked(prisma.companyPayment.findMany).mockResolvedValueOnce([
      { id: "payment_1", amount: 4_316_394 },
      { id: "upsell_1", amount: 500_000 },
    ] as never);
    // Le supplément est déjà confirmé chez Evolia : seule l'offre manque.
    vi.mocked(prisma.evoliaPush.findMany).mockResolvedValueOnce([
      { reference: "upsell_1" },
    ] as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      { user: { id: "manager_1", name: "Marie Dupont", email: "marie@example.mg" } },
    ] as never);

    await pushParticipantsToEvolia("company_1");

    expect(createdPayloads()).toEqual([
      {
        event: "payment.confirmed",
        type: "company_payment",
        reference: "payment_1",
        amount: 4_316_394,
      },
      expect.objectContaining({ event: "company.participants.confirmed" }),
    ]);
    expect(prisma.companyPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ method: { in: ["VIREMENT", "CHEQUE"] } }, { reviewedById: { not: null } }],
        }),
      })
    );
  });

  it("envoie la confirmation à l'adresse de confirmation, pas à celle des inscriptions", async () => {
    vi.stubEnv("EVOLIA_CONFIRMATION_URL", "https://evolia.test/payments/webhook");
    vi.mocked(prisma.evoliaPush.findUnique).mockResolvedValue({
      id: "push_1",
      event: "payment.confirmed",
      payload: {
        event: "payment.confirmed",
        type: "company_payment",
        reference: "payment_1",
        amount: 10,
      },
    } as never);

    await confirmPaymentToEvolia("company_1", "payment_1", 10);

    expect(fetchMock.mock.calls[0][0]).toBe("https://evolia.test/payments/webhook");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      event: "payment.confirmed",
      type: "company_payment",
      reference: "payment_1",
      amount: 10,
    });
  });

  it("converts a legacy payment method when resending an old push", async () => {
    vi.mocked(prisma.evoliaPush.findUnique).mockResolvedValue({
      id: "push_1",
      payload: { event: "company.registration.pushed", paymentMethod: "CARTE_BANCAIRE" },
    } as never);

    await deliverEvoliaPush("push_1");

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ paymentMethod: "evolia" });
  });

  it("explains a Cloudflare challenge instead of storing its HTML page", async () => {
    fetchMock.mockResolvedValue(
      new Response("<!DOCTYPE html><title>Just a moment...</title>", { status: 403 })
    );

    await deliverEvoliaPush("push_1");

    expect(prisma.evoliaPush.update).toHaveBeenCalledWith({
      where: { id: "push_1" },
      data: expect.objectContaining({ lastError: expect.stringContaining("Cloudflare") }),
    });
  });
});

describe("participant fields for the badges (20 oct. 2026)", () => {
  it("sends each participant's job title and ticket (offer of the registration)", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(COMPANY as never);
    vi.mocked(prisma.companyPayment.findFirst).mockResolvedValue({ id: "payment_1" } as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      {
        user: {
          id: "manager_1",
          name: "Marie Dupont",
          email: "marie@example.mg",
          title: "Directrice générale",
        },
        plan: { name: "Executive", description: "Accès complet" },
      },
      {
        user: { id: "user_2", name: "Jean Rabe", email: "jean@example.mg", title: null },
        plan: { name: "Executive Pass", description: null },
      },
    ] as never);

    await pushParticipantsToEvolia("company_1");

    expect(pushedPayload().payload).toMatchObject({
      participants: [
        {
          fullName: "Marie Dupont",
          title: "Directrice générale",
          ticket: { type: "Executive", description: "Accès complet" },
        },
        {
          fullName: "Jean Rabe",
          title: null,
          ticket: { type: "Executive Pass", description: null },
        },
      ],
    });
  });

  it("falls back to the company's offer when the registration has none", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(COMPANY as never);
    vi.mocked(prisma.companyPayment.findFirst).mockResolvedValue({ id: "payment_1" } as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      {
        user: { id: "user_2", name: "Jean Rabe", email: "jean@example.mg", title: "DAF" },
        plan: null,
      },
    ] as never);

    await pushParticipantsToEvolia("company_1");

    expect(pushedPayload().payload).toMatchObject({
      participants: [{ title: "DAF", ticket: { type: "Executive", description: "Accès complet" } }],
    });
  });

  it("gives the manager a title and ticket on the registration push too", async () => {
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(
      payment({
        companySubscription: {
          company: { ...COMPANY, companyAdmin: { ...COMPANY.companyAdmin, title: "CEO" } },
        },
      }) as never
    );

    await pushRegistrationToEvolia("payment_1");

    expect(pushedPayload().payload).toMatchObject({
      participants: [
        {
          fullName: "Marie Dupont",
          title: "CEO",
          ticket: { type: "Executive", description: "Accès complet" },
        },
      ],
    });
  });

  it("does not send a profile photo", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(COMPANY as never);
    vi.mocked(prisma.companyPayment.findFirst).mockResolvedValue({ id: "payment_1" } as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      {
        user: { id: "user_2", name: "Jean Rabe", email: "jean@example.mg", title: null },
        plan: null,
      },
    ] as never);

    await pushParticipantsToEvolia("company_1");

    const [participant] = (pushedPayload().payload as { participants: Record<string, unknown>[] })
      .participants;
    expect(Object.keys(participant).sort()).toEqual(
      ["email", "fullName", "isInitiator", "ticket", "title"].sort()
    );
  });
});

describe("before Evolia is activated (23 oct. 2026)", () => {
  it("records the push as held and sends nothing", async () => {
    vi.mocked(prisma.platformSetting.findMany).mockResolvedValueOnce([]);
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue(
      payment({ method: "VIREMENT" }) as never
    );

    expect(await pushRegistrationToEvolia("payment_1")).toBe(false);

    expect(prisma.evoliaPush.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "HELD", event: "company.registration.pushed" }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("releases registrations first, then sends each company's current list once", async () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 23, 10, m));
    vi.mocked(prisma.evoliaPush.findMany).mockResolvedValueOnce([
      {
        id: "list_old",
        companyId: "company_1",
        event: "company.participants.confirmed",
        createdAt: at(1),
      },
      {
        id: "reg_c1",
        companyId: "company_1",
        event: "company.registration.pushed",
        reference: "pay_ok",
        createdAt: at(0),
      },
      {
        id: "reg_cancelled",
        companyId: "c2",
        event: "company.registration.pushed",
        reference: "pay_rejected",
        createdAt: at(2),
      },
      {
        id: "list_new",
        companyId: "company_1",
        event: "company.participants.confirmed",
        createdAt: at(3),
      },
    ] as never);
    vi.mocked(prisma.companyPayment.findUnique).mockImplementation((async ({
      where,
    }: {
      where: { id: string };
    }) => ({ status: where.id === "pay_rejected" ? "REJECTED" : "CONFIRMED" })) as never);
    vi.mocked(prisma.evoliaPush.findUnique).mockImplementation((async ({
      where,
    }: {
      where: { id: string };
    }) => ({ id: where.id, payload: { event: "x" } })) as never);
    // L'inscription de company_1 est chez Evolia ; sa liste actuelle est recalculée.
    vi.mocked(prisma.evoliaPush.findFirst).mockResolvedValue({ id: "reg_c1" } as never);
    vi.mocked(prisma.company.findUnique).mockResolvedValue(COMPANY as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      {
        user: { id: "manager_1", name: "Marie Dupont", email: "marie@example.mg", title: "DG" },
        plan: null,
      },
    ] as never);

    const result = await releaseHeldEvoliaPushes();

    // reg_c1 transmise ; les deux instantanés de liste écartés au profit d'une
    // liste recalculée, envoyée une seule fois ; reg_cancelled écartée.
    expect(result).toEqual({ sent: 2, failed: 0, skipped: 3, deferred: 0 });
    const setAside = vi
      .mocked(prisma.evoliaPush.updateMany)
      .mock.calls.filter(([args]) => args.data.status === "SKIPPED")
      .map(([args]) => (args.where as { id: string }).id);
    expect(setAside.sort()).toEqual(["list_new", "list_old", "reg_cancelled"]);
    expect(prisma.evoliaPush.create).toHaveBeenCalledTimes(1);
    expect(pushedPayload().event).toBe("company.participants.confirmed");
  });

  it("keeps a list held while its company's registration has not reached Evolia", async () => {
    vi.mocked(prisma.evoliaPush.findMany).mockResolvedValueOnce([
      {
        id: "list_c9",
        companyId: "c9",
        event: "company.participants.confirmed",
        createdAt: new Date(),
      },
    ] as never);
    vi.mocked(prisma.evoliaPush.findFirst).mockResolvedValue(null);

    const result = await releaseHeldEvoliaPushes();

    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0, deferred: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rebuilds a failed registration from current data instead of resending the stale one", async () => {
    // Deux échecs pour le même paiement, dont le contenu enregistré date d'avant l'API actuelle.
    vi.mocked(prisma.evoliaPush.findMany)
      .mockResolvedValueOnce([] as never) // retenus
      .mockResolvedValueOnce([
        { id: "old_1", reference: "payment_1" },
        { id: "old_2", reference: "payment_1" },
      ] as never); // inscriptions en échec
    vi.mocked(prisma.companyPayment.findUnique).mockResolvedValue({
      ...payment(),
      status: "CONFIRMED",
    } as never);
    vi.mocked(prisma.evoliaPush.findFirst).mockResolvedValue({ id: "push_1" } as never);

    const result = await releaseHeldEvoliaPushes({ retryFailedRegistrations: true });

    // Un seul nouvel envoi, avec le montant et la devise que l'ancien n'avait pas.
    expect(prisma.evoliaPush.create).toHaveBeenCalledTimes(1);
    expect(pushedPayload().payload).toMatchObject({
      paymentMethod: "evolia",
      amountDue: 12_500_000,
      currency: "MGA",
    });
    expect(result).toEqual({ sent: 1, failed: 0, skipped: 1, deferred: 0 });
    const setAside = vi
      .mocked(prisma.evoliaPush.updateMany)
      .mock.calls.filter(([args]) => args.data.status === "SKIPPED")
      .map(([args]) => (args.where as { id: string }).id);
    expect(setAside.sort()).toEqual(["old_1", "old_2"]);
  });

  it("keeps the failed registration as is when nothing could be rebuilt", async () => {
    vi.mocked(prisma.evoliaPush.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: "old_1", reference: "payment_1" }] as never);
    vi.mocked(prisma.companyPayment.findUnique)
      .mockResolvedValueOnce({ status: "CONFIRMED" } as never) // contrôle du paiement
      .mockResolvedValueOnce(null as never); // reconstruction : paiement introuvable
    vi.mocked(prisma.evoliaPush.findFirst).mockResolvedValue(null);

    const result = await releaseHeldEvoliaPushes({ retryFailedRegistrations: true });

    expect(prisma.evoliaPush.create).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(vi.mocked(prisma.evoliaPush.updateMany)).toHaveBeenCalledWith({
      where: { id: "old_1", status: "PENDING" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
  });

  it("never sends a push another release already claimed", async () => {
    vi.mocked(prisma.evoliaPush.findMany).mockResolvedValueOnce([
      {
        id: "reg_x",
        companyId: "cx",
        event: "company.registration.pushed",
        reference: null,
        createdAt: new Date(),
      },
    ] as never);
    vi.mocked(prisma.evoliaPush.updateMany).mockResolvedValueOnce({ count: 0 });

    const result = await releaseHeldEvoliaPushes();

    expect(result.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
