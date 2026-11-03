import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { toExcelCsv } from "@/lib/csv";
import { formatDateFr } from "@/lib/utils";
import {
  buildFieldListTable,
  buildMeetingsListTable,
  loadAdminMeetings,
  parseAdminMeetingFilters,
} from "@/lib/meeting-admin";
import { renderMeetingsPdf } from "@/lib/pdf/meetings-pdf";

/**
 * GET /api/admin/rendez-vous/[eventId]/export — module 21, lot 9 (P7).
 * `?vue=liste` (défaut) : tous les rendez-vous ; `?vue=terrain` : la liste
 * terrain (confirmés). `?format=csv` (défaut, lisible par Excel) ou `pdf`.
 * `?statut=` et `?jour=` reprennent les filtres de la page. Réservé à la
 * section « événements » de l'admin ; chaque export est journalisé (il
 * contient des noms et des numéros de téléphone).
 */
export async function GET(req: Request, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;
  let adminId: string;
  try {
    ({ userId: adminId } = await requireAdmin("evenements"));
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const view = url.searchParams.get("vue") === "terrain" ? "terrain" : "liste";
  const filters = parseAdminMeetingFilters({
    statut: url.searchParams.get("statut"),
    jour: url.searchParams.get("jour"),
  });

  const data = await loadAdminMeetings(eventId, filters);
  if (!data) return NextResponse.json({ error: "Événement introuvable." }, { status: 404 });

  const table =
    view === "terrain" ? buildFieldListTable(data, filters) : buildMeetingsListTable(data, filters);
  const filename = `${view === "terrain" ? "liste-terrain" : "rendez-vous"}-${data.event.title
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()}`;

  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "meeting.export",
      targetType: "Event",
      targetId: eventId,
      metadata: { vue: view, format, rows: table.rows.length },
    },
  });

  if (format === "pdf") {
    const pdf = await renderMeetingsPdf({ table, generatedAtLabel: formatDateFr(new Date()) });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(toExcelCsv([table.header, ...table.rows]), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
