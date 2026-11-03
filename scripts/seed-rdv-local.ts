/**
 * Module 21 (3 nov. 2026) — comptes de test des rendez-vous B2B, pour la
 * recette en local (lot 10) et les essais dans un navigateur automatisé.
 *
 *   npx tsx scripts/seed-rdv-local.ts              # crée (ou remet à jour) les comptes
 *   npx tsx scripts/seed-rdv-local.ts --reinitialiser  # efface leurs demandes et rendez-vous (pour rejouer un essai)
 *   npx tsx scripts/seed-rdv-local.ts --supprimer  # liste la commande de suppression des comptes
 *
 * Crée, **dans la base locale uniquement**, un administrateur et quatre
 * membres de test, chacun dans sa propre entreprise (offre Gold active, liée
 * au Summit) et inscrit à l'événement : ils voient donc « Mes créneaux » et
 * peuvent demander et recevoir des rendez-vous. « Dan » n'a volontairement
 * pas de téléphone : son profil est incomplet, il ne peut pas recevoir de
 * demande (bouton grisé chez les autres).
 *
 * Ne touche à aucun compte existant. Refuse de tourner si la base n'est pas
 * locale ou si NODE_ENV vaut « production ». Aucun email n'est envoyé.
 */
import bcrypt from "bcryptjs";

import { prisma } from "../lib/prisma";
import { registerCompanyMemberToEvent } from "../lib/event-participation";

export const SEED_PASSWORD = "E2e-Rdv-2026!";

const MEMBERS = [
  { key: "alice", name: "Alice E2E", title: "Directrice commerciale", phone: "+261 34 00 000 01" },
  { key: "bob", name: "Bob E2E", title: "Directeur général", phone: "+261 34 00 000 02" },
  { key: "carla", name: "Carla E2E", title: "Responsable export", phone: "+261 34 00 000 03" },
  { key: "dan", name: "Dan E2E", title: "Consultant", phone: null }, // profil incomplet
] as const;

const emailOf = (key: string) => `e2e-${key}@yopmail.com`;
const ALL_EMAILS = [emailOf("admin"), ...MEMBERS.map((m) => emailOf(m.key))];

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/?]+)/)?.[1] ?? "";
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1"].includes(host)) {
    console.error(`Refusé : la base n'est pas locale (hôte « ${host || "inconnu"} »).`);
    process.exit(1);
  }
}

async function main() {
  if (process.argv.includes("--supprimer")) {
    console.log("Pour supprimer ces comptes de test (aperçu, puis --apply) :");
    console.log(`  npx tsx scripts/delete-accounts.ts ${ALL_EMAILS.join(" ")}`);
    console.log(`  npx tsx scripts/delete-accounts.ts ${ALL_EMAILS.join(" ")} --apply`);
    return;
  }
  assertLocalDatabase();

  if (process.argv.includes("--reinitialiser")) {
    const users = await prisma.user.findMany({
      where: { email: { in: ALL_EMAILS } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    const slots = await prisma.meetingParticipantSlot.deleteMany({
      where: { userId: { in: ids } },
    });
    const bookings = await prisma.meetingBooking.deleteMany({
      where: { OR: [{ requesterId: { in: ids } }, { recipientId: { in: ids } }] },
    });
    console.log(`✓ ${bookings.count} demande(s) et ${slots.count} choix de créneau effacés.`);
    return;
  }

  const event = await prisma.event.findFirst({
    where: { type: "SUMMIT", isOnline: false, meetingSetup: { status: "PUBLISHED" } },
    orderBy: { date: "asc" },
    select: { id: true, title: true },
  });
  if (!event) throw new Error("Aucun Summit avec des créneaux publiés dans la base locale.");
  const plan = await prisma.plan.findFirst({
    where: { eventId: event.id, name: "Gold", isActive: true },
    select: { id: true },
  });
  if (!plan) throw new Error("Offre « Gold » liée au Summit introuvable.");

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const now = new Date();
  const nextYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  // Administrateur (section « événements » incluse : SUPER_ADMIN).
  const admin = await prisma.user.upsert({
    where: { email: emailOf("admin") },
    update: { passwordHash, status: "ACTIVE", isPlatformAdmin: true },
    create: {
      email: emailOf("admin"),
      name: "Admin E2E",
      passwordHash,
      status: "ACTIVE",
      role: "ADMIN",
      isPlatformAdmin: true,
      emailVerifiedAt: now,
    },
  });
  await prisma.adminUser.upsert({
    where: { userId: admin.id },
    update: { role: "SUPER_ADMIN", active: true },
    create: { userId: admin.id, role: "SUPER_ADMIN" },
  });

  for (const m of MEMBERS) {
    const companyName = `E2E ${m.name.split(" ")[0]} SARL`;
    let company = await prisma.company.findFirst({ where: { name: companyName } });
    if (!company) {
      company = await prisma.company.create({
        data: {
          name: companyName,
          sector: "Technologie & Digital",
          country: "Madagascar",
          adminParticipates: true,
        },
      });
    }
    const user = await prisma.user.upsert({
      where: { email: emailOf(m.key) },
      update: { passwordHash, status: "ACTIVE", phone: m.phone, companyId: company.id },
      create: {
        email: emailOf(m.key),
        name: m.name,
        title: m.title,
        phone: m.phone,
        country: "Madagascar",
        sectors: ["Technologie & Digital"],
        passwordHash,
        status: "ACTIVE",
        role: "MEMBER",
        emailVerifiedAt: now,
        companyId: company.id,
      },
    });
    await prisma.company.update({ where: { id: company.id }, data: { companyAdminId: user.id } });
    await prisma.companySubscription.upsert({
      where: { companyId: company.id },
      update: { planId: plan.id, status: "ACTIVE" },
      create: {
        companyId: company.id,
        planId: plan.id,
        status: "ACTIVE",
        startDate: now,
        endDate: nextYear,
        declaredParticipants: 1,
      },
    });
    const registered = await registerCompanyMemberToEvent(user.id, event.id, plan.id);
    console.log(
      `${registered ? "✓" : "✗ (événement complet)"} ${m.name.padEnd(11)} ${emailOf(m.key)}${m.phone ? "" : "   [sans téléphone]"}`
    );
  }

  console.log(`✓ Admin E2E    ${emailOf("admin")}`);
  console.log(`\nÉvénement : ${event.title} (${event.id})`);
  console.log(`Mot de passe de tous ces comptes : ${SEED_PASSWORD}`);
  console.log("Nettoyage : npx tsx scripts/seed-rdv-local.ts --supprimer");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
