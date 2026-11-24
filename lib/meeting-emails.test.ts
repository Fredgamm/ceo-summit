import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    meetingBooking: { findUnique: vi.fn() },
    event: { findUnique: vi.fn() },
    eventRegistration: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/email-template-resolver", () => ({ resolveEmail: vi.fn() }));
vi.mock("@/lib/resend", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/lib/meeting-calendar", () => ({ loadMeetingCalendarInput: vi.fn() }));
vi.mock("@/lib/meeting-participation", () => ({ meetingEventIdFor: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPushToUser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { resolveEmail } from "@/lib/email-template-resolver";
import { sendTransactionalEmail } from "@/lib/resend";
import { loadMeetingCalendarInput } from "@/lib/meeting-calendar";
import { meetingEventIdFor } from "@/lib/meeting-participation";
import { sendPushToUser } from "@/lib/push";
import {
  cleanForEmail,
  firstNameOf,
  responseMessageSentence,
  sendMeetingCancelledEmails,
  sendMeetingConfirmedEmails,
  sendMeetingDeclinedEmail,
  sendMeetingExpiredEmails,
  sendMeetingPartnerMessageEmail,
  sendMeetingRequestEmail,
  sendMeetingSlotsOpenEmails,
} from "./meeting-emails";

const person = (id: string, name: string, company: string) => ({
  id,
  name,
  title: "Directeur",
  email: `${id}@x.re`,
  company: { name: company },
});

const BOOKING = {
  id: "b1",
  reason: "Échanger sur un partenariat logistique.",
  expiresAt: new Date("2027-01-10T06:50:00Z"),
  slot: {
    startTime: new Date("2027-01-11T06:00:00Z"),
    endTime: new Date("2027-01-11T06:30:00Z"),
  },
  event: {
    title: "CEO Summit 2027",
    location: "Saint-Denis",
    timezone: "Indian/Reunion",
    meetingSetup: { zone: "Espace B2B", accessInstructions: "Niveau 1" },
  },
  requester: person("marie", "Marie Andrianina", "Océan Logistique"),
  recipient: person("paul", "Paul Rakoto", "Rakoto Holding"),
};

const sent = () =>
  vi.mocked(resolveEmail).mock.calls.map(([key, variables]) => ({ key, variables }));

describe("cleanForEmail", () => {
  it("strips the marks the email templates would turn into formatting or links", () => {
    expect(cleanForEmail("**urgent** _vite_")).toBe("urgent vite");
    expect(cleanForEmail("Cliquez [ici](https://evil.example)")).toBe(
      "Cliquez (ici)(https://evil.example)"
    );
    expect(cleanForEmail("  ligne 1\n\nligne   2  ")).toBe("ligne 1 ligne 2");
    expect(cleanForEmail(null)).toBe("");
  });

  it("leaves nothing the markdown link pattern can match", () => {
    const cleaned = cleanForEmail("[x](https://evil.example) et [y](javascript:alert(1))");
    expect(cleaned).not.toMatch(/\[[^\]]*\]\([^)]*\)/);
  });
});

describe("firstNameOf", () => {
  it("takes the first word of the name", () => {
    expect(firstNameOf("Marie Andrianina")).toBe("Marie");
    expect(firstNameOf("Cher*ie  X")).toBe("Cherie");
  });
});

describe("meeting emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(BOOKING as never);
    vi.mocked(resolveEmail).mockResolvedValue({ subject: "S", react: null as never });
    vi.mocked(sendTransactionalEmail).mockResolvedValue({ id: "x" });
  });

  it("request: goes to the recipient with the two single-use links, and no phone", async () => {
    await sendMeetingRequestEmail("b1", "TOKEN123");

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "paul@x.re", subject: "S" })
    );
    const [{ key, variables }] = sent();
    expect(key).toBe("meeting-request-received");
    expect(variables).toMatchObject({
      firstName: "Paul",
      requesterName: "Marie Andrianina",
      requesterCompany: "Océan Logistique",
      slotDate: "11 janvier 2027",
      slotTime: "10h00 – 10h30",
      timezoneLabel: expect.stringContaining("Réunion"),
      expiresAt: expect.stringContaining("10 janvier 2027"),
    });
    expect(String(variables.acceptUrl)).toMatch(
      /\/rendez-vous\/repondre\/TOKEN123\?choix=accepter$/
    );
    expect(String(variables.declineUrl)).toMatch(
      /\/rendez-vous\/repondre\/TOKEN123\?choix=decliner$/
    );
    expect(JSON.stringify(variables)).not.toMatch(/phone|téléphone|\+262/i);
  });

  it("request: also pushes a notification to the recipient's devices, never the requester's", async () => {
    await sendMeetingRequestEmail("b1", "TOKEN123");

    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser).toHaveBeenCalledWith(
      "paul",
      expect.objectContaining({
        title: "Nouvelle demande de rendez-vous",
        body: expect.stringContaining("Marie Andrianina"),
        url: "/profil?onglet=mes-rendez-vous",
      })
    );
  });

  it("declined: pushes to the requester", async () => {
    await sendMeetingDeclinedEmail("b1");

    expect(sendPushToUser).toHaveBeenCalledWith(
      "marie",
      expect.objectContaining({ title: "Demande de rendez-vous refusée" })
    );
  });

  it("request: a motif typed with markdown cannot become a link in the email", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue({
      ...BOOKING,
      reason: "Voir [mon offre](https://evil.example) **vite**",
    } as never);

    await sendMeetingRequestEmail("b1", "T");

    const reason = String(sent()[0].variables.reason);
    expect(reason).not.toMatch(/\[[^\]]*\]\([^)]*\)/);
    expect(reason).not.toContain("**");
  });

  it("confirmed: each side gets the other's contact details and the .ics attached", async () => {
    vi.mocked(loadMeetingCalendarInput).mockImplementation(async (_id, viewerId) => ({
      ok: true,
      input: {
        bookingId: "b1",
        start: BOOKING.slot.startTime,
        end: BOOKING.slot.endTime,
        eventTitle: "CEO Summit 2027",
        eventLocation: "Saint-Denis",
        zone: "Espace B2B",
        accessInstructions: "Niveau 1",
        timezoneLabel: "heure de La Réunion",
        startLabel: "11 janvier 2027, 10h00",
        partner:
          viewerId === "marie"
            ? {
                name: "Paul Rakoto",
                title: "DG",
                companyName: "Rakoto Holding",
                phone: "+262 692 00",
                email: "paul@x.re",
              }
            : {
                name: "Marie Andrianina",
                title: "DG",
                companyName: "Océan Logistique",
                phone: "+261 34 00",
                email: "marie@x.re",
              },
        reason: "Motif",
        partnerProfileUrl: "https://b2b/membres/x",
      },
    }));

    await sendMeetingConfirmedEmails("b1");

    expect(sent().map((s) => s.key)).toEqual([
      "meeting-confirmed-requester",
      "meeting-confirmed-recipient",
    ]);
    expect(sent()[0].variables).toMatchObject({ firstName: "Marie", partnerPhone: "+262 692 00" });
    expect(sent()[1].variables).toMatchObject({ firstName: "Paul", partnerPhone: "+261 34 00" });
    const calls = vi.mocked(sendTransactionalEmail).mock.calls;
    expect(calls[0][0].to).toBe("marie@x.re");
    expect(calls[1][0].to).toBe("paul@x.re");
    for (const [args] of calls) {
      expect(args.attachments).toHaveLength(1);
      expect(args.attachments![0]).toMatchObject({
        filename: "rendez-vous-ceo-summit.ics",
        contentType: expect.stringContaining("text/calendar"),
      });
      expect(args.attachments![0].content).toContain("BEGIN:VCALENDAR");
    }
  });

  it("declined: only the requester is told", async () => {
    await sendMeetingDeclinedEmail("b1");

    expect(sent().map((s) => s.key)).toEqual(["meeting-declined"]);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "marie@x.re" })
    );
    expect(sent()[0].variables).toMatchObject({ partnerName: "Paul Rakoto" });
  });

  it("expired: both people are told, each in their own wording", async () => {
    await sendMeetingExpiredEmails("b1");

    expect(sent().map((s) => s.key)).toEqual([
      "meeting-expired-requester",
      "meeting-expired-recipient",
    ]);
    const tos = vi.mocked(sendTransactionalEmail).mock.calls.map(([a]) => a.to);
    expect(tos).toEqual(["marie@x.re", "paul@x.re"]);
  });

  it("cancelled by the organizer: both people, with the right sentence", async () => {
    await sendMeetingCancelledEmails([
      { id: "b1", wasConfirmed: true },
      { id: "b1", wasConfirmed: false },
    ]);

    const sentences = sent().map((s) => s.variables.statusSentence);
    expect(sentences).toEqual([
      "Votre rendez-vous confirmé est annulé.",
      "Votre rendez-vous confirmé est annulé.",
      "Votre demande en attente est annulée.",
      "Votre demande en attente est annulée.",
    ]);
  });

  it("never throws, and does not send when the template was disabled by an admin", async () => {
    vi.mocked(resolveEmail).mockResolvedValueOnce(null);
    await expect(sendMeetingDeclinedEmail("b1")).resolves.toBeUndefined();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendTransactionalEmail).mockRejectedValue(new Error("SMTP down"));
    await expect(sendMeetingExpiredEmails("b1")).resolves.toBeUndefined();
  });

  it("does nothing for an unknown meeting", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue(null);

    await sendMeetingRequestEmail("nope", "T");

    expect(resolveEmail).not.toHaveBeenCalled();
  });
});

describe("sendMeetingSlotsOpenEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveEmail).mockResolvedValue({ subject: "S", react: null as never });
    vi.mocked(sendTransactionalEmail).mockResolvedValue({ id: "x" });
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      title: "CEO Summit 2027",
      timezone: "Indian/Reunion",
      meetingSetup: { zone: "Espace B2B", accessInstructions: "Niveau 1" },
    } as never);
    vi.mocked(prisma.eventRegistration.findMany).mockResolvedValue([
      { user: { id: "u1", name: "Marie A", email: "u1@x.re" } },
      { user: { id: "u2", name: "Paul R", email: "u2@x.re" } },
      { user: { id: "u3", name: "Zoé K", email: "u3@x.re" } },
    ] as never);
  });

  it("only goes to the members already registered who are eligible", async () => {
    // u2 n'est plus éligible (offre inactive, par exemple).
    vi.mocked(meetingEventIdFor).mockImplementation(async (id) => (id === "u2" ? null : "evt_1"));

    const attempted = await sendMeetingSlotsOpenEmails("evt_1");

    expect(attempted).toBe(2);
    const tos = vi
      .mocked(sendTransactionalEmail)
      .mock.calls.map(([a]) => a.to)
      .sort();
    expect(tos).toEqual(["u1@x.re", "u3@x.re"]);
    expect(sent()[0].key).toBe("meeting-slots-open");
    expect(sent()[0].variables).toMatchObject({
      eventTitle: "CEO Summit 2027",
      zone: "Espace B2B",
    });
  });

  it("reads only confirmed registrations of that event", async () => {
    vi.mocked(meetingEventIdFor).mockResolvedValue("evt_1");

    await sendMeetingSlotsOpenEmails("evt_1");

    expect(prisma.eventRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "evt_1", status: "CONFIRMED" } })
    );
  });
});

describe("le mot du destinataire dans les emails (A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveEmail).mockResolvedValue({ subject: "S", react: null as never });
    vi.mocked(sendTransactionalEmail).mockResolvedValue({ id: "x" });
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue({
      ...BOOKING,
      responseMessage: "Retrouvons-nous à l'entrée.",
    } as never);
  });

  it("responseMessageSentence: a short sentence, or nothing at all", () => {
    expect(responseMessageSentence("Avec plaisir !")).toBe(" Son message : « Avec plaisir ! ».");
    expect(responseMessageSentence(null)).toBe("");
    expect(responseMessageSentence("   ")).toBe("");
  });

  it("responseMessageSentence: markdown typed in the word cannot become formatting or a link", () => {
    const sentence = responseMessageSentence("Voir [mon site](https://evil.example) **vite**");
    expect(sentence).not.toMatch(/\[[^\]]*\]\([^)]*\)/);
    expect(sentence).not.toContain("**");
  });

  it("declined: the requester gets the word in the email", async () => {
    await sendMeetingDeclinedEmail("b1");

    expect(sent()[0].variables.responseMessageSentence).toBe(
      " Son message : « Retrouvons-nous à l'entrée. »."
    );
  });

  it("confirmed: the word is passed to the template (used by the requester's email)", async () => {
    vi.mocked(loadMeetingCalendarInput).mockResolvedValue({
      ok: true,
      input: {
        bookingId: "b1",
        start: BOOKING.slot.startTime,
        end: BOOKING.slot.endTime,
        eventTitle: "CEO Summit 2027",
        eventLocation: "Saint-Denis",
        zone: "Espace B2B",
        accessInstructions: "Niveau 1",
        timezoneLabel: "heure de La Réunion",
        startLabel: "11 janvier 2027, 10h00",
        partner: { name: "Paul", title: null, companyName: "X", phone: "+262", email: "p@x.re" },
        reason: "Motif",
        partnerProfileUrl: "https://b2b/membres/x",
      },
    } as never);

    await sendMeetingConfirmedEmails("b1");

    expect(sent().map((s) => s.variables.responseMessageSentence)).toEqual([
      " Son message : « Retrouvons-nous à l'entrée. ».",
      " Son message : « Retrouvons-nous à l'entrée. ».",
    ]);
  });

  it("sendMeetingPartnerMessageEmail: a separate email to the requester, with a link to answer", async () => {
    await sendMeetingPartnerMessageEmail("b1");

    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "marie@x.re" })
    );
    const [{ key, variables }] = sent();
    expect(key).toBe("meeting-partner-message");
    expect(variables).toMatchObject({
      firstName: "Marie",
      partnerName: "Paul Rakoto",
      message: "Retrouvons-nous à l'entrée.",
    });
    expect(String(variables.conversationUrl)).toMatch(/\/messagerie\?new=paul$/);
  });

  it("sendMeetingPartnerMessageEmail: nothing is sent when there is no word", async () => {
    vi.mocked(prisma.meetingBooking.findUnique).mockResolvedValue({
      ...BOOKING,
      responseMessage: null,
    } as never);

    await sendMeetingPartnerMessageEmail("b1");

    expect(resolveEmail).not.toHaveBeenCalled();
  });
});
