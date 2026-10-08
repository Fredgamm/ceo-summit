import { prisma } from "@/lib/prisma";
import { seatCap } from "@/lib/company-seats";
import { pushParticipantsToEvolia } from "@/lib/evolia";
import {
  activeEventOf,
  registerCompanyMemberToEvent,
  sendEventRegistrationEmail,
} from "@/lib/event-participation";

/**
 * Module 21 §3.0 étape 3 (8 oct. 2026, demande du client) — une offre liée
 * à un événement vaut inscription à cet événement : les membres de
 * l'entreprise abonnée sont inscrits automatiquement, dans la limite des
 * places de l'offre, le gérant d'abord puis par date d'arrivée.
 *
 * Le gérant garde la main (module 18 §4.9) : il peut changer la liste depuis
 * son espace (`validateEventParticipants`). Un membre qu'il a retiré
 * (inscription `CANCELLED`) n'est jamais réinscrit automatiquement.
 *
 * Appelée quand l'offre est liée à un événement (admin), quand l'abonnement
 * devient actif (paiement, partenaire), quand des places sont ajoutées
 * (supplément) et quand un collaborateur rejoint l'entreprise. Ne fait rien
 * si l'offre n'est pas active ou n'est liée à aucun événement à venir.
 */
export async function autoRegisterCompanyMembers(
  companyId: string,
  logPrefix: string,
  /** `notify: false` : ni email ni envoi Evolia (rattrapage sur une base de test). */
  options: { notify?: boolean } = {}
): Promise<{ registered: number; full: number }> {
  const notify = options.notify ?? true;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      subscription: { include: { plan: { include: { event: true } } } },
      users: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true },
      },
    },
  });
  const activeEvent = activeEventOf(company?.subscription);
  if (!company?.subscription || !activeEvent) return { registered: 0, full: 0 };

  const memberIds = company.users.map((u) => u.id);
  const existing = await prisma.eventRegistration.findMany({
    where: { eventId: activeEvent.eventId, userId: { in: memberIds } },
    select: { userId: true, status: true },
  });
  const known = new Set(existing.map((r) => r.userId));
  const taken = existing.filter((r) => r.status !== "CANCELLED").length;

  const cap = seatCap(company.subscription);
  const free = cap == null ? Infinity : Math.max(0, cap - taken);
  // Le gérant d'abord, puis les collaborateurs par date d'arrivée.
  const candidates = [...company.users]
    .sort((a, b) =>
      a.id === company.companyAdminId ? -1 : b.id === company.companyAdminId ? 1 : 0
    )
    .filter((u) => !known.has(u.id))
    .slice(0, free);

  let registered = 0;
  let full = 0;
  let managerRegistered = false;
  for (const member of candidates) {
    const outcome = await registerCompanyMemberToEvent(
      member.id,
      activeEvent.eventId,
      activeEvent.planId
    );
    if (!outcome) {
      full++;
      continue;
    }
    if (member.id === company.companyAdminId) managerRegistered = true;
    if (!outcome.wasConfirmed) {
      registered++;
      if (notify) await sendEventRegistrationEmail(member, outcome.event, logPrefix);
    }
  }

  if (managerRegistered && !company.adminParticipates) {
    // Le gérant inscrit occupe une place (`countUsedSeats`).
    await prisma.company.update({ where: { id: companyId }, data: { adminParticipates: true } });
  }
  if (full > 0) {
    console.warn(
      `[${logPrefix}] event ${activeEvent.eventId} full: ${full} member(s) not registered`
    );
  }
  if (registered > 0 && notify) {
    // Liste à jour vers Evolia (badges). Un échec est journalisé (EvoliaPush).
    await pushParticipantsToEvolia(companyId);
  }
  return { registered, full };
}

/**
 * L'admin enregistre une offre liée à un événement : les membres de chaque
 * entreprise abonnée sont inscrits (sans effet sur ceux déjà inscrits ou
 * retirés par leur gérant — ré-enregistrer l'offre rattrape donc un membre
 * oublié). Si l'événement a changé, les inscriptions faites par cette offre
 * sur l'ancien événement sont d'abord annulées.
 */
export async function syncPlanEventRegistrations(
  planId: string,
  previousEventId: string | null,
  newEventId: string | null
): Promise<{ registered: number }> {
  if (previousEventId && previousEventId !== newEventId) {
    await prisma.eventRegistration.updateMany({
      where: { eventId: previousEventId, planId, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });
  }
  if (!newEventId) return { registered: 0 };

  const subscriptions = await prisma.companySubscription.findMany({
    where: { planId },
    select: { companyId: true },
  });
  let registered = 0;
  for (const { companyId } of subscriptions) {
    registered += (await autoRegisterCompanyMembers(companyId, "syncPlanEventRegistrations"))
      .registered;
  }
  return { registered };
}
