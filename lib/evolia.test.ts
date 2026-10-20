import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companyPayment: { findUnique: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    company: { findUnique: vi.fn() },
    eventRegistration: { findMany: vi.fn().mockResolvedValue([]) },
    evoliaPush: {
      create: vi.fn().mockResolvedValue({ id: "push_1" }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  deliverEvoliaPush,
  evoliaPaymentUrl,
  pushParticipantsToEvolia,
  pushRegistrationToEvolia,
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
  it("builds the payment link from the reference", () => {
    expect(evoliaPaymentUrl("pay_1")).toBe("https://event.aiolia.us/ceosummit/payment/pay_1");
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

    await pushParticipantsToEvolia("company_1");

    const [registration, list] = createdPayloads();
    expect(registration).toMatchObject({
      event: "company.registration.pushed",
      ceoSummitReference: "sub_1",
      paymentMethod: "virement",
    });
    expect(registration).not.toHaveProperty("amountDue");
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
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      { user: { id: "manager_1", name: "Marie Dupont", email: "marie@example.mg" } },
    ] as never);

    await pushParticipantsToEvolia("company_1");

    expect(createdPayloads().map((p) => p.event)).toEqual(["company.participants.confirmed"]);
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
