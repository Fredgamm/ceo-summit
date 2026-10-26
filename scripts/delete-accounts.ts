/**
 * 26 oct. 2026 — suppression définitive de comptes membres (comptes de test,
 * doublons). L'application n'a pas d'action « supprimer », seulement
 * suspendre / exclure : ce script fait le ménage dans toutes les tables qui
 * pointent vers le compte, puis supprime le compte.
 *
 *   npx tsx scripts/delete-accounts.ts a@x.mg b@y.com           # aperçu, n'écrit rien
 *   npx tsx scripts/delete-accounts.ts a@x.mg b@y.com --apply   # supprime
 *
 * `--avec-paiements` (comptes de test uniquement) : un compte qui a soumis
 * des paiements devient supprimable, à condition que ces paiements
 * concernent l'organisation qu'il gère seul ; elle est alors supprimée avec
 * ses paiements et son abonnement.
 *
 * Refuse, sans rien toucher : un administrateur de la plateforme, un compte
 * qui a soumis un paiement (historique financier), le gérant d'une
 * organisation qui a d'autres membres (transférer d'abord la gestion).
 * Organisation gérée seule : supprimée avec le compte si elle n'a aucun
 * paiement, sinon conservée sans gérant.
 */
import { prisma } from "../lib/prisma";

const withPayments = process.argv.includes("--avec-paiements");

type Plan = {
  userId: string;
  email: string;
  companyToDelete: string | null;
  companyToRelease: string | null;
};

async function inspect(email: string): Promise<Plan | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      company: { select: { name: true } },
      companyAdminOf: {
        select: {
          id: true,
          name: true,
          users: { where: { email: { not: email } }, select: { email: true } },
          subscription: { select: { _count: { select: { payments: true } } } },
        },
      },
    },
  });
  if (!user) {
    console.log(`\n✗ ${email} : aucun compte.`);
    return null;
  }

  const id = user.id;
  const counts = {
    "inscriptions événement": await prisma.eventRegistration.count({ where: { userId: id } }),
    "messages privés": await prisma.message.count({ where: { senderId: id } }),
    conversations: await prisma.conversation.count({
      where: { OR: [{ member1Id: id }, { member2Id: id }] },
    }),
    "opportunités Deal Room": await prisma.opportunity.count({ where: { authorId: id } }),
    "contacts Deal Room": await prisma.opportunityContact.count({
      where: { OR: [{ initiatorId: id }, { receiverId: id }] },
    }),
    "messages de salon": await prisma.roomMessage.count({ where: { authorId: id } }),
    "fiches services": await prisma.serviceListing.count({ where: { authorId: id } }),
    "rendez-vous": await prisma.meetingBooking.count({
      where: { OR: [{ requesterId: id }, { recipientId: id }] },
    }),
    "journal d'audit": await prisma.auditLog.count({ where: { actorId: id } }),
  };
  const payments = await prisma.companyPayment.count({ where: { submittedById: id } });

  console.log(`\n• ${email} — ${user.name} (${user.status})`);
  console.log(`  Organisation : ${user.company?.name ?? "aucune"}`);
  for (const [label, n] of Object.entries(counts)) if (n > 0) console.log(`  ${label} : ${n}`);

  if (user.isPlatformAdmin) {
    console.log("  ✗ REFUSÉ : administrateur de la plateforme (retirer d'abord son rôle).");
    return null;
  }
  const managed = user.companyAdminOf;
  if (payments > 0) {
    if (!withPayments) {
      console.log(
        `  ✗ REFUSÉ : ${payments} paiement(s) soumis — historique financier à conserver (compte de test : --avec-paiements).`
      );
      return null;
    }
    const elsewhere = await prisma.companyPayment.count({
      where: {
        submittedById: id,
        companySubscription: { companyId: { not: managed?.id ?? "" } },
      },
    });
    if (elsewhere > 0) {
      console.log(
        `  ✗ REFUSÉ : ${elsewhere} paiement(s) soumis pour une organisation qu'il ne gère pas seul.`
      );
      return null;
    }
    console.log(`  ${payments} paiement(s) soumis : supprimés (--avec-paiements).`);
  }

  let companyToDelete: string | null = null;
  let companyToRelease: string | null = null;
  if (managed) {
    if (managed.users.length > 0) {
      console.log(
        `  ✗ REFUSÉ : gérant de « ${managed.name} », qui compte d'autres membres (${managed.users
          .map((u) => u.email)
          .join(", ")}). Transférer d'abord la gestion.`
      );
      return null;
    }
    if (!withPayments && (managed.subscription?._count.payments ?? 0) > 0) {
      companyToRelease = managed.id;
      console.log(`  Organisation « ${managed.name} » : conservée sans gérant (paiements).`);
    } else {
      companyToDelete = managed.id;
      console.log(
        `  Organisation « ${managed.name} » : supprimée aussi (${
          withPayments ? "avec ses paiements et son abonnement" : "vide, aucun paiement"
        }).`
      );
    }
  }
  console.log("  ✓ Supprimable.");
  return { userId: id, email, companyToDelete, companyToRelease };
}

async function remove({ userId: id, companyToDelete, companyToRelease }: Plan) {
  await prisma.$transaction(async (tx) => {
    const conversations = await tx.conversation.findMany({
      where: { OR: [{ member1Id: id }, { member2Id: id }] },
      select: { id: true },
    });
    const conversationIds = conversations.map((c) => c.id);
    await tx.message.deleteMany({
      where: { OR: [{ senderId: id }, { conversationId: { in: conversationIds } }] },
    });
    await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });

    await tx.opportunityContact.deleteMany({
      where: { OR: [{ initiatorId: id }, { receiverId: id }, { opportunity: { authorId: id } }] },
    });
    await tx.opportunity.deleteMany({ where: { authorId: id } });

    await tx.roomReport.deleteMany({
      where: { OR: [{ reportedById: id }, { roomMessage: { authorId: id } }] },
    });
    await tx.roomMessage.deleteMany({ where: { authorId: id } });
    await tx.roomRead.deleteMany({ where: { userId: id } });
    await tx.roomSuspension.deleteMany({ where: { OR: [{ userId: id }, { createdById: id }] } });

    await tx.serviceListing.deleteMany({ where: { authorId: id } });
    await tx.eventRegistration.deleteMany({ where: { userId: id } });
    await tx.creditTransaction.deleteMany({ where: { userId: id } });
    await tx.creditPurchase.deleteMany({ where: { userId: id } });
    await tx.creditBalance.deleteMany({ where: { userId: id } });
    await tx.broadcastRecipient.deleteMany({ where: { userId: id } });
    await tx.companyInvite.deleteMany({ where: { invitedById: id } });
    await tx.partnerInvite.deleteMany({ where: { invitedById: id } });
    await tx.auditLog.deleteMany({ where: { actorId: id } });

    if (companyToRelease) {
      await tx.company.update({ where: { id: companyToRelease }, data: { companyAdminId: null } });
    }
    // Jetons, créneaux et rendez-vous : supprimés en cascade avec le compte.
    await tx.user.delete({ where: { id } });

    if (companyToDelete) {
      await tx.companyInvite.deleteMany({ where: { companyId: companyToDelete } });
      await tx.evoliaPush.deleteMany({ where: { companyId: companyToDelete } });
      await tx.companyPayment.deleteMany({
        where: { companySubscription: { companyId: companyToDelete } },
      });
      await tx.companySubscription.deleteMany({ where: { companyId: companyToDelete } });
      await tx.company.delete({ where: { id: companyToDelete } });
    }
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const emails = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"))
    .map((e) => e.toLowerCase().trim());
  if (emails.length === 0) {
    console.log("Usage : npx tsx scripts/delete-accounts.ts email1 [email2…] [--apply]");
    return;
  }

  const plans: Plan[] = [];
  for (const email of emails) {
    const plan = await inspect(email);
    if (plan) plans.push(plan);
  }

  if (!apply) {
    console.log(
      `\nAperçu seulement : ${plans.length} compte(s) supprimable(s). Relancer avec --apply.`
    );
    return;
  }
  for (const plan of plans) {
    await remove(plan);
    console.log(`✓ ${plan.email} supprimé.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
