import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { formatDateFr } from "@/lib/utils";
import type { FinanceTransaction } from "@/lib/finance";

/** E8-T10 — "Export comptable CSV". */
export async function GET() {
  try {
    await requireAdmin("finances");
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const [companyPayments, registrations, purchases] = await Promise.all([
    prisma.companyPayment.findMany({
      where: { status: { in: ["CONFIRMED", "REJECTED"] } },
      include: {
        companySubscription: {
          include: { company: { select: { name: true } }, plan: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.eventRegistration.findMany({
      where: { paymentStatus: "PAID" },
      include: {
        user: { select: { name: true } },
        event: { select: { title: true, price: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.creditPurchase.findMany({
      where: { status: "CONFIRMED" },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const transactions: FinanceTransaction[] = [
    ...companyPayments.map((p) => ({
      id: p.id,
      source: "COMPANY" as const,
      memberName: p.companySubscription.company.name,
      description: `Offre ${p.companySubscription.plan.name}`,
      amount: p.amount,
      method: p.method,
      date: p.createdAt,
    })),
    ...registrations.map((r) => ({
      id: r.id,
      source: "EVENT" as const,
      memberName: r.user.name,
      description: r.event.title,
      amount: r.event.price,
      method: r.paymentMethod ?? "",
      date: r.createdAt,
    })),
    ...purchases.map((p) => ({
      id: p.id,
      source: "CREDITS" as const,
      memberName: p.user.name,
      description: `Pack ${p.credits} crédits`,
      amount: p.priceAr,
      method: p.paymentMethod,
      date: p.createdAt,
    })),
  ];

  transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

  const rows = [
    ["Membre", "Source", "Description", "Montant (Ar)", "Méthode", "Date"],
    ...transactions.map((t) => [
      t.memberName,
      t.source,
      t.description,
      String(t.amount),
      t.method,
      formatDateFr(t.date),
    ]),
  ];

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="export-comptable-ceo-summit.csv"`,
    },
  });
}
