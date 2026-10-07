import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { formatDateFr } from "@/lib/utils";
import {
  companyPaymentToTransaction,
  COMPANY_PAYMENT_FINANCE_INCLUDE,
  RECORDED_COMPANY_PAYMENT_WHERE,
  type FinanceTransaction,
} from "@/lib/finance";

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

  const [companyPayments, registrations] = await Promise.all([
    prisma.companyPayment.findMany({
      where: RECORDED_COMPANY_PAYMENT_WHERE,
      include: COMPANY_PAYMENT_FINANCE_INCLUDE,
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
  ]);

  const transactions: FinanceTransaction[] = [
    ...companyPayments.map(companyPaymentToTransaction),
    ...registrations.map((r) => ({
      id: r.id,
      source: "EVENT" as const,
      memberName: r.user.name,
      description: r.event.title,
      amount: r.event.price,
      method: r.paymentMethod ?? "",
      date: r.createdAt,
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
