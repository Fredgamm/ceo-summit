import { PrismaClient, Role, Tier, MembershipStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

import { encryptMessageContent } from "../lib/message-crypto";

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
      isPlatformAdmin: true,
      status: MembershipStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.adminUser.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, role: "SUPER_ADMIN" },
  });

  // ── Demo Chairman-equivalent member (for local dev) ──
  // 4 août 2026 (CEO Summit devenu intégralement B2B) — plus de Membership
  // personnel : le tier vient désormais du rang de l'offre plateforme de
  // l'entreprise (lib/plan-access.ts::getViewerTierFromCompany).
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

  const demoPlan = await prisma.plan.upsert({
    where: { slug: "demo-chairman" },
    update: {},
    create: {
      name: "Chairman (démo)",
      slug: "demo-chairman",
      priceAr: 1500000,
      includedCredits: 0,
      hasUnlimitedCredits: true,
      rank: 3,
      isActive: true,
      isSelfService: false,
    },
  });

  const demoCompany = await prisma.company.upsert({
    where: { id: "demo-company-seed" },
    update: {},
    create: {
      id: "demo-company-seed",
      name: "Razanamahery Group",
      sector: "Finance",
      country: "Madagascar",
      companyAdminId: demoMember.id,
    },
  });

  await prisma.user.update({ where: { id: demoMember.id }, data: { companyId: demoCompany.id } });

  await prisma.companySubscription.upsert({
    where: { companyId: demoCompany.id },
    update: {},
    create: {
      companyId: demoCompany.id,
      planId: demoPlan.id,
      status: "ACTIVE",
      startDate: new Date("2026-01-15"),
      endDate: new Date("2027-01-15"),
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

  // ── Deal Room opportunities (E6-T01/T02 demo data — no admin CRUD UI
  // exists yet to create these for real) ──
  await prisma.opportunity.upsert({
    where: { id: "opp_energie_solaire" },
    update: {},
    create: {
      id: "opp_energie_solaire",
      authorId: admin.id,
      title: "Recherche partenaire pour ferme solaire de 50MW à Toliara",
      type: "PARTENARIAT",
      sector: "Énergie & Environnement",
      country: "Madagascar",
      description:
        "Projet de ferme solaire photovoltaïque de 50MW en phase de développement avancé (études de faisabilité et foncier sécurisés). Recherche partenaire technique et/ou financier pour la phase de construction.",
      budget: 1_450_000_000,
      deadline: inDays(60),
      visibility: Tier.MEMBER,
      status: "PUBLISHED",
    },
  });

  await prisma.opportunity.upsert({
    where: { id: "opp_levee_fintech" },
    update: {},
    create: {
      id: "opp_levee_fintech",
      authorId: admin.id,
      title: "Levée de fonds Série A — plateforme fintech mobile money",
      type: "LEVEE_FONDS",
      sector: "Finance & Investissement",
      country: "Comores",
      description:
        "Fintech en forte croissance (150 000 utilisateurs actifs) lançant sa Série A pour financer l'expansion régionale et l'obtention de licences bancaires additionnelles.",
      budget: 120_000_000,
      deadline: inDays(45),
      visibility: Tier.EXECUTIVE,
      status: "PUBLISHED",
    },
  });

  await prisma.opportunity.upsert({
    where: { id: "opp_appel_offres_port" },
    update: {},
    create: {
      id: "opp_appel_offres_port",
      authorId: admin.id,
      title: "Appel à offres — modernisation infrastructure portuaire",
      type: "APPEL_OFFRES",
      sector: "BTP & Infrastructure",
      country: "Île Maurice",
      description:
        "Appel à offres pour la modernisation des équipements de manutention et la digitalisation des opérations du port. Réservé aux membres Chairman en raison de la confidentialité du cahier des charges.",
      budget: 1_950_000_000,
      deadline: inDays(30),
      visibility: Tier.CHAIRMAN,
      status: "PUBLISHED",
    },
  });

  await prisma.opportunity.upsert({
    where: { id: "opp_joint_venture_agri" },
    update: {},
    create: {
      id: "opp_joint_venture_agri",
      authorId: demoMember.id,
      title: "Joint-venture transformation agroalimentaire — export vanille & épices",
      type: "JOINT_VENTURE",
      sector: "Agriculture & Alimentation",
      country: "Madagascar",
      description:
        "Recherche de partenaire régional pour la création d'une unité de transformation et de conditionnement dédiée à l'export de vanille et d'épices vers l'Europe et les Émirats.",
      budget: 35_000_000,
      deadline: null,
      visibility: Tier.MEMBER,
      status: "PUBLISHED",
    },
  });

  // ── Salles thématiques (E4-T02/T03 demo data — no admin "create room" UI
  // per backlog scope, rooms are seeded; membership only tracks tier access) ──
  const roomEnergie = await prisma.room.upsert({
    where: { id: "room_energie" },
    update: {},
    create: {
      id: "room_energie",
      name: "Énergie & Environnement",
      description:
        "Transition énergétique, énergies renouvelables et environnement dans l'Océan Indien.",
      sector: "Énergie & Environnement",
      minTier: "ALL_MEMBERS",
      status: "ACTIVE",
    },
  });

  await prisma.room.upsert({
    where: { id: "room_finance" },
    update: {},
    create: {
      id: "room_finance",
      name: "Finance & Investissement",
      description: "Marchés, M&A, private equity et financement de projets régionaux.",
      sector: "Finance & Banque",
      minTier: "EXECUTIVE_PLUS",
      status: "ACTIVE",
    },
  });

  await prisma.room.upsert({
    where: { id: "room_chairman" },
    update: {},
    create: {
      id: "room_chairman",
      name: "Salle Privée Chairman",
      description:
        "Espace confidentiel réservé aux membres Chairman — dossiers stratégiques et co-investissements.",
      sector: "Autre",
      minTier: "CHAIRMAN_ONLY",
      status: "ACTIVE",
    },
  });

  await prisma.roomMessage.upsert({
    where: { id: "roommsg_energie_1" },
    update: {},
    create: {
      id: "roommsg_energie_1",
      roomId: roomEnergie.id,
      authorId: admin.id,
      content:
        "Bienvenue dans la salle Énergie & Environnement — un espace pour échanger sur la transition énergétique et les projets EnR de la région.",
    },
  });

  await prisma.roomMessage.upsert({
    where: { id: "roommsg_energie_2" },
    update: {},
    create: {
      id: "roommsg_energie_2",
      roomId: roomEnergie.id,
      authorId: demoMember.id,
      content:
        "Merci pour l'accueil ! Je travaille justement sur un projet de ferme solaire à Toliara, disponible pour échanger avec d'autres porteurs de projets énergétiques.",
    },
  });

  // ── Messagerie privée (E7-T01/T02 demo data) — content is pgcrypto
  // ciphertext, so it's encrypted here via lib/message-crypto.ts rather
  // than a plain string, exactly like a real message would be stored ──
  const [member1Id, member2Id] = [admin.id, demoMember.id].sort();
  const demoConversation = await prisma.conversation.upsert({
    where: { member1Id_member2Id: { member1Id, member2Id } },
    update: {},
    create: { id: "conv_admin_demo", member1Id, member2Id },
  });

  await prisma.message.upsert({
    where: { id: "msg_demo_1" },
    update: {},
    create: {
      id: "msg_demo_1",
      conversationId: demoConversation.id,
      senderId: admin.id,
      content: await encryptMessageContent(
        "Bonjour Sarah, bienvenue sur la plateforme CEO Summit ! N'hésitez pas si vous avez des questions."
      ),
      readAt: new Date(),
    },
  });

  await prisma.message.upsert({
    where: { id: "msg_demo_2" },
    update: {},
    create: {
      id: "msg_demo_2",
      conversationId: demoConversation.id,
      senderId: demoMember.id,
      content: await encryptMessageContent("Merci beaucoup, tout est très clair !"),
      readAt: new Date(),
    },
  });

  await prisma.conversation.update({
    where: { id: demoConversation.id },
    data: { lastMessageAt: new Date() },
  });

  // ── Catalogue de services (E5-T01/T02 demo data — no admin CRUD UI exists
  // yet to create these for real, they go through the moderation flow) ──
  await prisma.serviceListing.upsert({
    where: { id: "svc_audit_strategique" },
    update: {},
    create: {
      id: "svc_audit_strategique",
      authorId: demoMember.id,
      title: "Audit stratégique & accompagnement levée de fonds",
      category: "Conseil & Stratégie",
      description:
        "Accompagnement des PME et ETI dans leurs opérations de croissance : audit stratégique, structuration financière et mise en relation avec des investisseurs régionaux.",
      priceInfo: "Sur devis",
      gallery: [],
      status: "PUBLISHED",
    },
  });

  await prisma.serviceListing.upsert({
    where: { id: "svc_conformite_juridique" },
    update: {},
    create: {
      id: "svc_conformite_juridique",
      authorId: admin.id,
      title: "Mise en conformité juridique & fiscale régionale",
      category: "Juridique & Fiscal",
      description:
        "Cabinet spécialisé dans l'accompagnement des entreprises de l'Océan Indien sur leurs obligations juridiques et fiscales multi-juridictions (Madagascar, Maurice, Comores, La Réunion).",
      priceInfo: "À partir de 800 000 Ar",
      gallery: [],
      status: "PUBLISHED",
    },
  });

  // ── Membership applications (E8-T02 dashboard demo data) ──
  await prisma.membershipApplication.upsert({
    where: { id: "app_sonia_bouchard" },
    update: {},
    create: {
      id: "app_sonia_bouchard",
      fullName: "Sonia Bouchard",
      email: "sonia.bouchard@totalenergies-oi.mg",
      companyName: "TotalEnergies OI",
      title: "Directrice Générale",
      sector: "Énergie & Environnement",
      country: "Madagascar",
      motivation:
        "Souhaite rejoindre le cercle pour développer des partenariats régionaux dans l'énergie.",
      requestedTier: Tier.EXECUTIVE,
      status: "PENDING",
      consentedAt: new Date(),
    },
  });

  await prisma.membershipApplication.upsert({
    where: { id: "app_ali_hassan" },
    update: {},
    create: {
      id: "app_ali_hassan",
      fullName: "Ali Hassan Moufida",
      email: "ali.hassan@comores-invest.km",
      companyName: "Comores Invest",
      title: "CEO",
      sector: "Finance & Banque",
      country: "Comores",
      motivation: "Recommandé par un membre actuel pour son expertise en investissement régional.",
      requestedTier: Tier.CHAIRMAN,
      status: "PENDING",
      consentedAt: new Date(),
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
