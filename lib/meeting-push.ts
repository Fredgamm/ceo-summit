import type { PushPayload } from "@/lib/push";

/**
 * Textes des notifications push du module Rendez-vous B2B (module 24). Un push
 * est un signal court : qui, quand, et un lien vers la page où répondre. Le
 * détail reste dans l'email et dans « Mes rendez-vous ».
 */

export type MeetingPushKind =
  | "request"
  | "confirmed"
  | "declined"
  | "partner-message"
  | "expired-requester"
  | "expired-recipient"
  | "cancelled"
  | "slots-open";

export interface MeetingPushInput {
  bookingId?: string;
  /** L'autre personne : le demandeur (pour « request »), le partenaire sinon. */
  partnerName?: string;
  partnerCompany?: string | null;
  /** « 11 janvier 2027, 10h30 – 11h00 » */
  when?: string;
  message?: string | null;
  eventTitle?: string;
  wasConfirmed?: boolean;
}

const RDV_URL = "/profil?onglet=mes-rendez-vous";

const withCompany = (name: string, company?: string | null) =>
  company ? `${name} (${company})` : name;

export function meetingPush(kind: MeetingPushKind, input: MeetingPushInput): PushPayload {
  const who = withCompany(input.partnerName ?? "Un participant", input.partnerCompany);
  const when = input.when ? ` · ${input.when}` : "";
  const tag = input.bookingId ? `meeting-${input.bookingId}` : `meeting-${kind}`;

  switch (kind) {
    case "request":
      return {
        title: "Nouvelle demande de rendez-vous",
        body: `${who}${when}`,
        url: RDV_URL,
        tag,
      };
    case "confirmed":
      return { title: "Rendez-vous confirmé", body: `${who}${when}`, url: RDV_URL, tag };
    case "declined":
      return {
        title: "Demande de rendez-vous refusée",
        body: input.message ? `${who} : ${input.message}` : `${who} ne peut pas vous recevoir.`,
        url: RDV_URL,
        tag,
      };
    case "partner-message":
      return {
        title: `Message de ${input.partnerName ?? "votre rendez-vous"}`,
        body: input.message ?? "Un mot à propos de votre rendez-vous.",
        url: RDV_URL,
        tag,
      };
    case "expired-requester":
      return {
        title: "Demande de rendez-vous expirée",
        body: `${who} n'a pas répondu à temps.`,
        url: RDV_URL,
        tag,
      };
    case "expired-recipient":
      return {
        title: "Demande de rendez-vous expirée",
        body: `Vous n'avez pas répondu à ${who} à temps.`,
        url: RDV_URL,
        tag,
      };
    case "cancelled":
      return {
        title: input.wasConfirmed ? "Rendez-vous annulé" : "Demande de rendez-vous annulée",
        body: `${who}${when} — annulé par l'organisation.`,
        url: RDV_URL,
        tag,
      };
    case "slots-open":
      return {
        title: "Vos créneaux de rendez-vous sont ouverts",
        body: input.eventTitle
          ? `${input.eventTitle} : choisissez ceux où vous êtes disponible.`
          : "Choisissez ceux où vous êtes disponible.",
        url: "/profil?onglet=creneaux",
        tag,
      };
  }
}
