import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { excelDecimal, toExcelCsv } from "@/lib/csv";
import { formatDateFr } from "@/lib/utils";
import { getEurToArRate } from "@/lib/currency-conversion";
import {
  companyPaymentToTransaction,
  eventRegistrationToTransaction,
  COMPANY_PAYMENT_FINANCE_INCLUDE,
  RECORDED_COMPANY_PAYMENT_WHERE,
  type FinanceTransaction,
} from "@/lib/finance";
import { buildFinanceExportTable } from "@/lib/finance-export";
import { renderFinanceExportPdf } from "@/lib/pdf/finance-export-pdf";

const FILENAME = "export-comptable-ceo-summit";

/**
 * E8-T10 — export comptable. Rapport QA du 7 oct. 2026 (§4.2) : en CSV (par
 * défaut) ou en PDF (`?format=pdf`), même contenu, euros d'abord au taux du
 * moment du paiement puis le montant en Ariary.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin("finances");
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";

  const [companyPayments, registrations, fallbackRate] = await Promise.all([
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
    getEurToArRate(),
  ]);

  const transactions: FinanceTransaction[] = [
    ...companyPayments.map(companyPaymentToTransaction),
    ...registrations.map(eventRegistrationToTransaction),
  ];
  const table = buildFinanceExportTable(transactions, fallbackRate);

  if (format === "pdf") {
    const pdf = await renderFinanceExportPdf({
      table,
      generatedAtLabel: formatDateFr(new Date()),
    });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${FILENAME}.pdf"`,
      },
    });
  }

  // Euros et taux en virgule décimale, pour qu'Excel les lise comme des nombres.
  const csvRows = table.rows.map((row) =>
    row.map((value, i) => (i === 3 || i === 5 ? excelDecimal(value) : value))
  );
  const csv = toExcelCsv([table.header, ...csvRows]);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FILENAME}.csv"`,
    },
  });
}
