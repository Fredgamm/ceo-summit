import { PrismaClient, Role, Tier, MembershipStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding CEO Summit database...");

  // ── Platform settings (Tarifs — matches bo-parametres.html defaults) ──
  await prisma.platformSetting.createMany({
    data: [
      { key: "membership_price_member", value: "200000" },
      { key: "membership_price_executive", value: "600000" },
      { key: "membership_price_chairman", value: "1500000" },
      { key: "credits_included_member", value: "0" },
      { key: "credits_included_executive", value: "10" },
    ],
    skipDuplicates: true,
  });

  await prisma.creditPackPrice.createMany({
    data: [
      { credits: 1, priceAr: 25000 },
      { credits: 5, priceAr: 100000 },
      { credits: 10, priceAr: 150000 },
    ],
    skipDuplicates: true,
  });

  // ── Référentiels ──
  const sectors = [
    "Énergie & Environnement",
    "Finance & Investissement",
    "Technologie & Innovation",
    "BTP & Infrastructure",
    "Agriculture & Alimentation",
    "Santé & Médecine",
    "Tourisme & Hôtellerie",
    "Transport & Logistique",
    "Télécommunications",
    "Éducation & Formation",
  ];
  const countries = [
    "Madagascar",
    "Maurice",
    "La Réunion",
    "Comores",
    "Maldives",
    "Seychelles",
    "Djibouti",
    "Mozambique",
    "Afrique du Sud",
  ];
  const opportunityTypes = [
    "Partenariat",
    "Investissement",
    "Appel d'offres",
    "Levée de fonds",
    "Joint-venture",
  ];

  for (const [type, values] of [
    ["sector", sectors],
    ["country", countries],
    ["opportunity_type", opportunityTypes],
  ] as const) {
    await prisma.referential.createMany({
      data: values.map((label, i) => ({ type, label, position: i })),
      skipDuplicates: true,
    });
  }

  // ── Admin account ──
  const adminPassword = await bcrypt.hash("ChangeMe123!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@ceosummit.mg" },
    update: {},
    create: {
      email: "admin@ceosummit.mg",
      name: "Admin CEO Summit",
      passwordHash: adminPassword,
      role: Role.ADMIN,
      status: MembershipStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.adminUser.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, role: "SUPER_ADMIN" },
  });

  // ── Demo Chairman member (for local dev) ──
  const demoPassword = await bcrypt.hash("Demo1234!", 12);
  const demoMember = await prisma.user.upsert({
    where: { email: "demo@ceosummit.mg" },
    update: {},
    create: {
      email: "demo@ceosummit.mg",
      name: "Sarah Razanamahery",
      title: "CEO",
      passwordHash: demoPassword,
      role: Role.CHAIRMAN,
      status: MembershipStatus.ACTIVE,
      country: "Madagascar",
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.membership.create({
    data: {
      userId: demoMember.id,
      tier: Tier.CHAIRMAN,
      startDate: new Date("2026-01-15"),
      endDate: new Date("2027-01-15"),
      status: MembershipStatus.ACTIVE,
      price: 1500000,
    },
  });

  await prisma.creditBalance.upsert({
    where: { userId: demoMember.id },
    update: {},
    create: { userId: demoMember.id, included: 999999, purchased: 0, used: 0 },
  });

  console.log("✅ Seed complete.");
  console.log("   Admin:  admin@ceosummit.mg / ChangeMe123!");
  console.log("   Member: demo@ceosummit.mg / Demo1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
