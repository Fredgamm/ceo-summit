import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { toExcelCsv } from "@/lib/csv";
import { formatDateFr } from "@/lib/utils";
import { isPartnerOffer } from "@/lib/partner-offers";
import {
  SUBSCRIPTION_STATUS_LABEL,
  buildAdminSubscriptionsQuery,
} from "@/lib/admin-subscriptions-query";

const FILENAME = "entreprises-ceo-summit";

const HEADER = [
  "Entreprise",
  "Secteur",
  "Pays",
  "Téléphone entreprise",
  "Site web",
  "Gérant",
  "Fonction",
  "E-mail gérant",
  "Téléphone gérant",
  "Offre",
  "Prix (Ar)",
  "Tarification",
  "Partenaire",
  "Statut",
  "Supplément à valider",
  "Participants déclarés",
  "Places supplémentaires",
  "Début",
  "Fin",
  "Inscrite le",
  "Mise à jour",
];

/**
 * 27 nov. 2026 — export CSV du tableau « Abonnements » de /admin/entreprises :
 * mêmes filtres que l'écran (recherche, statut, offre), toutes les pages,
 * même ordre.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin("entreprises");
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const params = new URL(req.url).searchParams;
  const { where } = buildAdminSubscriptionsQuery({
    q: params.get("q") ?? undefined,
    statut: params.get("statut") ?? undefined,
    offre: params.get("offre") ?? undefined,
  });

  const subscriptions = await prisma.companySubscription.findMany({
    where,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      company: {
        select: {
          name: true,
          sector: true,
          country: true,
          phone: true,
          website: true,
          createdAt: true,
          companyAdmin: { select: { name: true, email: true, title: true, phone: true } },
        },
      },
      plan: {
        select: {
          name: true,
          priceAr: true,
          pricingMode: true,
          isActive: true,
          isSelfService: true,
          isUpsell: true,
        },
      },
      payments: { where: { status: "PENDING" }, select: { id: true }, take: 1 },
    },
  });

  const rows = subscriptions.map((sub) => {
    const admin = sub.company.companyAdmin;
    return [
      sub.company.name,
      sub.company.sector,
      sub.company.country,
      sub.company.phone ?? "",
      sub.company.website ?? "",
      admin?.name ?? "",
      admin?.title ?? "",
      admin?.email ?? "",
      admin?.phone ?? "",
      sub.plan.name,
      String(sub.plan.priceAr),
      sub.plan.pricingMode === "PER_PARTICIPANT" ? "Par participant" : "Forfait",
      isPartnerOffer(sub.plan) ? "Oui" : "Non",
      SUBSCRIPTION_STATUS_LABEL[sub.status],
      sub.status !== "PENDING_REVIEW" && sub.payments.length > 0 ? "Oui" : "Non",
      sub.declaredParticipants != null ? String(sub.declaredParticipants) : "",
      String(sub.extraSeats),
      sub.startDate ? formatDateFr(sub.startDate) : "",
      sub.endDate ? formatDateFr(sub.endDate) : "",
      formatDateFr(sub.company.createdAt),
      formatDateFr(sub.updatedAt),
    ];
  });

  const csv = toExcelCsv([HEADER, ...rows]);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FILENAME}.csv"`,
    },
  });
}
