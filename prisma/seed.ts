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

  // ── Events (E3-T01/T02/T03 demo data — no admin CRUD yet to create these) ──
  const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  const summit = await prisma.event.upsert({
    where: { id: "evt_summit_2026" },
    update: {},
    create: {
      id: "evt_summit_2026",
      title: "CEO Summit 2026 — La Réunion",
      type: "SUMMIT",
      description:
        "Le rendez-vous annuel incontournable des dirigeants d'entreprise de l'Océan Indien. Pendant 2 jours, 300 décideurs des secteurs clés se réunissent pour partager des analyses, nouer des partenariats stratégiques et définir les grandes orientations économiques de la région.",
      program: [
        {
          day: "Jour 1 — 15 novembre",
          items: [
            "08h30 — Accueil & networking café",
            "09h30 — Discours d'ouverture",
            "10h30 — Table ronde : Économie Océan Indien 2027–2030",
            "19h30 — Cocktail de bienvenue",
          ],
        },
        {
          day: "Jour 2 — 16 novembre",
          items: [
            "09h00 — Keynote : Innovation & Transformation digitale",
            "14h30 — Table ronde : Investissement & Capital",
            "19h30 — Gala de clôture",
          ],
        },
      ],
      speakers: [
        { name: "Sarah Razanamahery", title: "DG", company: "BNI Madagascar" },
        { name: "Karan Mehta", title: "CEO", company: "Mauritius Telecom" },
        { name: "Farida Djabou", title: "DG Coopération OI", company: "Comores" },
      ],
      location: "Palais des Congrès, Saint-Denis, La Réunion",
      date: inDays(110),
      capacity: 300,
      minTier: Tier.MEMBER,
      price: 1500000,
      status: "PUBLISHED",
    },
  });

  await prisma.event.upsert({
    where: { id: "evt_diner_finance" },
    update: {},
    create: {
      id: "evt_diner_finance",
      title: "Dîner Privé — Secteur Finance & Banque",
      type: "DINER",
      description:
        "Dîner sur invitation réservé aux dirigeants du secteur financier. Format table ronde, 15 participants maximum.",
      location: "Hotel Carlton, Antananarivo",
      date: inDays(20),
      capacity: 15,
      minTier: Tier.EXECUTIVE,
      price: 0,
      status: "PUBLISHED",
    },
  });

  await prisma.event.upsert({
    where: { id: "evt_webinaire_q3" },
    update: {},
    create: {
      id: "evt_webinaire_q3",
      title: "Webinaire — Intelligence économique Océan Indien Q3 2026",
      type: "WEBINAIRE",
      description:
        "Analyse trimestrielle de l'économie régionale, ouvert à tous les membres. Replay disponible 7 jours.",
      location: "En ligne",
      isOnline: true,
      date: inDays(40),
      capacity: 500,
      minTier: Tier.MEMBER,
      price: 0,
      status: "PUBLISHED",
    },
  });

  await prisma.event.upsert({
    where: { id: "evt_rencontre_agri" },
    update: {},
    create: {
      id: "evt_rencontre_agri",
      title: "Rencontre B2B — Secteur Agricole & AgroIndustrie",
      type: "RENCONTRE",
      description:
        "Agenda de rendez-vous personnalisés entre dirigeants du secteur agricole et agro-industriel.",
      location: "Port Hotel, Toamasina",
      date: inDays(55),
      capacity: 40,
      minTier: Tier.EXECUTIVE,
      price: 300000,
      status: "PUBLISHED",
    },
  });

  await prisma.event.upsert({
    where: { id: "evt_summit_2025" },
    update: {},
    create: {
      id: "evt_summit_2025",
      title: "CEO Summit 2025 — Madagascar",
      type: "SUMMIT",
      description: "Édition précédente du CEO Summit, tenue à Antananarivo.",
      location: "Antananarivo, Madagascar",
      date: inDays(-200),
      capacity: 250,
      minTier: Tier.MEMBER,
      price: 1200000,
      status: "COMPLETED",
    },
  });

  await prisma.eventRegistration.upsert({
    where: { eventId_userId: { eventId: summit.id, userId: demoMember.id } },
    update: {},
    create: {
      eventId: summit.id,
      userId: demoMember.id,
      status: "CONFIRMED",
      paymentStatus: "PAID",
      paymentMethod: "VIREMENT",
    },
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
