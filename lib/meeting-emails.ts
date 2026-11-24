import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { resolveEmail } from "@/lib/email-template-resolver";
import { sendTransactionalEmail, type EmailAttachment } from "@/lib/resend";
import {
  formatDayKey,
  formatTimeInZone,
  formatTimeRangeInZone,
  timezoneLabel,
  zonedDayKey,
} from "@/lib/event-timezone";
import { loadMeetingCalendarInput } from "@/lib/meeting-calendar";
import { buildMeetingIcs, googleCalendarUrl } from "@/lib/meeting-ics";
import { meetingEventIdFor } from "@/lib/meeting-participation";
import { meetingPush } from "@/lib/meeting-push";
import { sendPushToUser } from "@/lib/push";

/**
 * Module 21 lot 7 (3 nov. 2026) — emails des rendez-vous B2B (annexe
 * `docs/21_annexe_emails_rendez_vous.md`). Toutes les fonctions sont « au
 * mieux » : un email qui ne part pas (SMTP en panne, modèle désactivé par
 * l'admin) est journalisé mais ne fait jamais échouer l'action du membre —
 * la demande, la réponse ou l'expiration sont déjà enregistrées.
 *
 * 4 nov. 2026 (module 24) — chaque événement part aussi en notification push
 * vers les appareils abonnés du membre (`sendPushToUser`, même règle : au mieux).
 */

/**
 * Valeurs saisies par les membres (nom, entreprise, fonction, motif) : les
 * modèles d'email interprètent `**gras**`, `_italique_` et `[texte](lien)`.
 * Sans nettoyage, un motif tapé `[Cliquez ici](https://…)` deviendrait un lien
 * dans un email envoyé au nom de la plateforme. On retire donc ces marques.
 */
export function cleanForEmail(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[*_]/g, "")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstNameOf(name: string): string {
  return cleanForEmail(name).split(" ")[0] || "";
}

/**
 * Phrase ajoutée à l'email du demandeur quand le destinataire a laissé un mot
 * en répondant : vide sans mot (les modèles n'ont pas de bloc conditionnel).
 * « Son message » reste correct quel que soit le genre de la personne.
 */
export function responseMessageSentence(message: string | null | undefined): string {
  const text = cleanForEmail(message);
  return text ? ` Son message : « ${text} ».` : "";
}

const person = {
  id: true,
  name: true,
  title: true,
  email: true,
  company: { select: { name: true } },
} as const;

async function loadBookingContext(bookingId: string) {
  const booking = await prisma.meetingBooking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      reason: true,
      responseMessage: true,
      expiresAt: true,
      slot: { select: { startTime: true, endTime: true } },
      event: {
        select: {
          title: true,
          location: true,
          timezone: true,
          meetingSetup: { select: { zone: true, accessInstructions: true } },
        },
      },
      requester: { select: person },
      recipient: { select: person },
    },
  });
  if (!booking) return null;
  const tz = booking.event.timezone;
  const dayLabel = (d: Date) => formatDayKey(zonedDayKey(d, tz));
  return {
    booking,
    shared: {
      eventTitle: cleanForEmail(booking.event.title),
      eventLocation: cleanForEmail(booking.event.location),
      zone: cleanForEmail(booking.event.meetingSetup?.zone),
      accessInstructions: cleanForEmail(booking.event.meetingSetup?.accessInstructions),
      slotDate: dayLabel(booking.slot.startTime),
      slotTime: formatTimeRangeInZone(booking.slot.startTime, booking.slot.endTime, tz),
      timezoneLabel: timezoneLabel(tz),
      reason: cleanForEmail(booking.reason),
    },
    expiresLabel: `${dayLabel(booking.expiresAt)} à ${formatTimeInZone(booking.expiresAt, tz)}`,
  };
}

type Person = NonNullable<Awaited<ReturnType<typeof loadBookingContext>>>["booking"]["requester"];

const profileUrl = (id: string) => `${appUrl()}/membres/${id}`;

/** Envoie un email du registre ; ne lève jamais (voir l'en-tête du fichier). */
async function send(
  to: string | null | undefined,
  key: string,
  variables: Record<string, string>,
  attachments?: EmailAttachment[]
): Promise<void> {
  if (!to) return;
  try {
    const email = await resolveEmail(key, variables);
    if (!email) return; // modèle désactivé par l'admin
    await sendTransactionalEmail({ to, ...email, attachments });
  } catch (err) {
    console.error(`[meeting-email] « ${key} » non envoyé à ${to}`, err);
  }
}

/** « Nouvelle demande » au destinataire, avec ses deux boutons à usage unique. */
export async function sendMeetingRequestEmail(bookingId: string, token: string): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  if (!ctx) return;
  const { booking, shared } = ctx;
  const respond = (choice: "accepter" | "decliner") =>
    `${appUrl()}/rendez-vous/repondre/${token}?choix=${choice}`;
  await send(booking.recipient.email, "meeting-request-received", {
    ...shared,
    firstName: firstNameOf(booking.recipient.name),
    requesterName: cleanForEmail(booking.requester.name),
    requesterCompany: cleanForEmail(booking.requester.company?.name),
    requesterTitle: cleanForEmail(booking.requester.title) || "Non renseignée",
    requesterProfileUrl: profileUrl(booking.requester.id),
    acceptUrl: respond("accepter"),
    declineUrl: respond("decliner"),
    expiresAt: ctx.expiresLabel,
  });
  await sendPushToUser(
    booking.recipient.id,
    meetingPush("request", {
      bookingId,
      partnerName: cleanForEmail(booking.requester.name),
      partnerCompany: cleanForEmail(booking.requester.company?.name),
      when: `${shared.slotDate}, ${shared.slotTime}`,
    })
  );
}

/** Confirmation aux deux participants : coordonnées du partenaire et fichier .ics joint. */
export async function sendMeetingConfirmedEmails(bookingId: string): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  if (!ctx) return;
  const { booking, shared } = ctx;

  const sides: { self: Person; key: string }[] = [
    { self: booking.requester, key: "meeting-confirmed-requester" },
    { self: booking.recipient, key: "meeting-confirmed-recipient" },
  ];
  for (const { self, key } of sides) {
    try {
      const calendar = await loadMeetingCalendarInput(bookingId, self.id);
      if (!calendar.ok) continue;
      const { partner } = calendar.input;
      await send(
        self.email,
        key,
        {
          ...shared,
          firstName: firstNameOf(self.name),
          partnerName: cleanForEmail(partner.name),
          partnerCompany: cleanForEmail(partner.companyName),
          partnerTitle: cleanForEmail(partner.title) || "Non renseignée",
          partnerPhone: partner.phone ?? "Non renseigné",
          partnerEmail: partner.email ?? "Non renseigné",
          partnerProfileUrl: calendar.input.partnerProfileUrl,
          icsUrl: `${appUrl()}/api/rendez-vous/${bookingId}/ics`,
          googleCalendarUrl: googleCalendarUrl(calendar.input),
          responseMessageSentence: responseMessageSentence(booking.responseMessage),
        },
        [
          {
            filename: "rendez-vous-ceo-summit.ics",
            content: buildMeetingIcs(calendar.input),
            contentType: "text/calendar; charset=utf-8; method=PUBLISH",
          },
        ]
      );
      await sendPushToUser(
        self.id,
        meetingPush("confirmed", {
          bookingId,
          partnerName: cleanForEmail(partner.name),
          partnerCompany: cleanForEmail(partner.companyName),
          when: `${shared.slotDate}, ${shared.slotTime}`,
        })
      );
    } catch (err) {
      console.error(`[meeting-email] confirmation non préparée pour ${self.id}`, err);
    }
  }
}

/** Refus : prévient le demandeur. */
export async function sendMeetingDeclinedEmail(bookingId: string): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  if (!ctx) return;
  const { booking, shared } = ctx;
  await send(booking.requester.email, "meeting-declined", {
    ...shared,
    firstName: firstNameOf(booking.requester.name),
    partnerName: cleanForEmail(booking.recipient.name),
    partnerCompany: cleanForEmail(booking.recipient.company?.name),
    directoryUrl: `${appUrl()}/catalogue`,
    responseMessageSentence: responseMessageSentence(booking.responseMessage),
  });
  await sendPushToUser(
    booking.requester.id,
    meetingPush("declined", {
      bookingId,
      partnerName: cleanForEmail(booking.recipient.name),
      partnerCompany: cleanForEmail(booking.recipient.company?.name),
      message: cleanForEmail(booking.responseMessage) || null,
    })
  );
}

/**
 * Le destinataire ajoute son mot après avoir répondu depuis l'email : la
 * confirmation (ou le refus) est déjà partie, le mot arrive donc dans un email
 * à part, avec un lien pour lui répondre dans la messagerie.
 */
export async function sendMeetingPartnerMessageEmail(bookingId: string): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  if (!ctx || !ctx.booking.responseMessage) return;
  const { booking, shared } = ctx;
  await send(booking.requester.email, "meeting-partner-message", {
    ...shared,
    firstName: firstNameOf(booking.requester.name),
    partnerName: cleanForEmail(booking.recipient.name),
    message: cleanForEmail(booking.responseMessage),
    conversationUrl: `${appUrl()}/messagerie?new=${booking.recipient.id}`,
  });
  await sendPushToUser(
    booking.requester.id,
    meetingPush("partner-message", {
      bookingId,
      partnerName: cleanForEmail(booking.recipient.name),
      message: cleanForEmail(booking.responseMessage),
    })
  );
}

/** Expiration : prévient les deux personnes. */
export async function sendMeetingExpiredEmails(bookingId: string): Promise<void> {
  const ctx = await loadBookingContext(bookingId);
  if (!ctx) return;
  const { booking, shared } = ctx;
  await send(booking.requester.email, "meeting-expired-requester", {
    ...shared,
    firstName: firstNameOf(booking.requester.name),
    partnerName: cleanForEmail(booking.recipient.name),
    partnerCompany: cleanForEmail(booking.recipient.company?.name),
    directoryUrl: `${appUrl()}/catalogue`,
  });
  await send(booking.recipient.email, "meeting-expired-recipient", {
    ...shared,
    firstName: firstNameOf(booking.recipient.name),
    requesterName: cleanForEmail(booking.requester.name),
    requesterCompany: cleanForEmail(booking.requester.company?.name),
    requesterProfileUrl: profileUrl(booking.requester.id),
  });
  await sendPushToUser(
    booking.requester.id,
    meetingPush("expired-requester", {
      bookingId,
      partnerName: cleanForEmail(booking.recipient.name),
      partnerCompany: cleanForEmail(booking.recipient.company?.name),
    })
  );
  await sendPushToUser(
    booking.recipient.id,
    meetingPush("expired-recipient", {
      bookingId,
      partnerName: cleanForEmail(booking.requester.name),
      partnerCompany: cleanForEmail(booking.requester.company?.name),
    })
  );
}

/**
 * Annulation par l'organisation (créneau désactivé, participant retiré) : les
 * deux personnes de chaque demande ou rendez-vous annulé sont prévenues.
 */
export async function sendMeetingCancelledEmails(
  cancelled: { id: string; wasConfirmed: boolean }[]
): Promise<void> {
  for (const { id, wasConfirmed } of cancelled) {
    const ctx = await loadBookingContext(id);
    if (!ctx) continue;
    const { booking, shared } = ctx;
    const statusSentence = wasConfirmed
      ? "Votre rendez-vous confirmé est annulé."
      : "Votre demande en attente est annulée.";
    for (const [self, other] of [
      [booking.requester, booking.recipient],
      [booking.recipient, booking.requester],
    ] as const) {
      await send(self.email, "meeting-cancelled-by-organizer", {
        ...shared,
        firstName: firstNameOf(self.name),
        partnerName: cleanForEmail(other.name),
        partnerCompany: cleanForEmail(other.company?.name),
        statusSentence,
        directoryUrl: `${appUrl()}/catalogue`,
      });
      await sendPushToUser(
        self.id,
        meetingPush("cancelled", {
          bookingId: id,
          partnerName: cleanForEmail(other.name),
          partnerCompany: cleanForEmail(other.company?.name),
          when: `${shared.slotDate}, ${shared.slotTime}`,
          wasConfirmed,
        })
      );
    }
  }
}

const SLOTS_OPEN_CHUNK = 10;

/**
 * « Vos créneaux sont ouverts » aux participants **déjà inscrits** au moment
 * de la publication (décision du 3 novembre). Renvoie le nombre d'emails
 * tentés. Un membre qui s'inscrit après ne le reçoit pas.
 */
export async function sendMeetingSlotsOpenEmails(eventId: string): Promise<number> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      timezone: true,
      meetingSetup: { select: { zone: true, accessInstructions: true } },
    },
  });
  if (!event) return 0;
  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId, status: "CONFIRMED" },
    select: { user: { select: { id: true, name: true, email: true } } },
  });

  let attempted = 0;
  for (let i = 0; i < registrations.length; i += SLOTS_OPEN_CHUNK) {
    const chunk = registrations.slice(i, i + SLOTS_OPEN_CHUNK);
    await Promise.allSettled(
      chunk.map(async ({ user }) => {
        // Même condition d'éligibilité que « Mes créneaux » : offre active liée au Summit.
        if ((await meetingEventIdFor(user.id)) !== eventId) return;
        attempted++;
        await send(user.email, "meeting-slots-open", {
          firstName: firstNameOf(user.name),
          eventTitle: cleanForEmail(event.title),
          zone: cleanForEmail(event.meetingSetup?.zone),
          accessInstructions: cleanForEmail(event.meetingSetup?.accessInstructions),
          timezoneLabel: timezoneLabel(event.timezone),
          mySlotsUrl: `${appUrl()}/profil?onglet=creneaux`,
        });
        await sendPushToUser(user.id, meetingPush("slots-open", { eventTitle: event.title }));
      })
    );
  }
  return attempted;
}
