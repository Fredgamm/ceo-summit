/**
 * Module 21 (8 oct. 2026) — rattrapage unique : inscrit à leur événement les
 * membres des entreprises dont l'offre était déjà liée à un événement avant
 * l'inscription automatique (lib/event-auto-registration.ts).
 *
 *   npx tsx scripts/backfill-event-registrations.ts           # aperçu, n'écrit rien
 *   npx tsx scripts/backfill-event-registrations.ts --apply   # inscrit et envoie les emails
 *
 * ⚠ `--apply` envoie l'email d'inscription à chaque nouveau participant et
 * pousse les listes vers Evolia : à lancer une seule fois, sur la bonne base.
 */
import { prisma } from "../lib/prisma";
import { seatCap } from "../lib/company-seats";
import { activeEventOf } from "../lib/event-participation";
import { autoRegisterCompanyMembers } from "../lib/event-auto-registration";

async function main() {
  const apply = process.argv.includes("--apply");
  const subscriptions = await prisma.companySubscription.findMany({
    where: { plan: { eventId: { not: null } } },
    include: {
      plan: { include: { event: true } },
      company: {
        select: {
          id: true,
          name: true,
          users: { where: { status: "ACTIVE" }, select: { id: true } },
        },
      },
    },
  });

  let total = 0;
  for (const sub of subscriptions) {
    const active = activeEventOf(sub);
    if (!active) continue;
    const registered = await prisma.eventRegistration.count({
      where: {
        eventId: active.eventId,
        userId: { in: sub.company.users.map((u) => u.id) },
        status: { not: "CANCELLED" },
      },
    });
    const cap = seatCap(sub);
    console.log(
      `${sub.company.name} — offre « ${sub.plan.name} » → ${sub.plan.event?.title} : ` +
        `${sub.company.users.length} membre(s) actif(s), ${registered} inscrit(s), ` +
        `${cap ?? "∞"} place(s)`
    );
    if (apply) {
      const result = await autoRegisterCompanyMembers(sub.company.id, "backfill");
      total += result.registered;
      console.log(
        `   → ${result.registered} inscrit(s)${result.full ? `, ${result.full} refusé(s) : événement complet` : ""}`
      );
    }
  }
  console.log(
    apply
      ? `Terminé : ${total} inscription(s).`
      : "Aperçu seulement : relancer avec --apply pour inscrire."
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
