import { NextResponse } from "next/server";

import { requireViewer } from "@/lib/require-viewer";
import { loadMeetingCalendarInput } from "@/lib/meeting-calendar";
import { buildMeetingIcs } from "@/lib/meeting-ics";

/**
 * GET /api/rendez-vous/[id]/ics — fichier calendrier d'un rendez-vous B2B
 * confirmé ou terminé (module 21, P6 ; doc client §10). Réservé aux deux
 * participants ; un visiteur non connecté est renvoyé vers la connexion par
 * le middleware, puis revient sur ce lien.
 *
 * `inline` plutôt que `attachment` : Safari sur iPhone ouvre alors directement
 * la feuille « Ajouter à l'agenda » au lieu de ranger le fichier dans
 * « Fichiers » ; Chrome sur Android le télécharge et le propose à Google
 * Agenda. Jamais mis en cache : il contient un téléphone (RG-04).
 */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const viewerResult = await requireViewer();
  if (!viewerResult.success) {
    return NextResponse.json({ error: viewerResult.error }, { status: 401 });
  }

  const result = await loadMeetingCalendarInput(id, viewerResult.viewer.id);
  if (!result.ok) {
    return result.reason === "not-found"
      ? NextResponse.json({ error: "Rendez-vous introuvable." }, { status: 404 })
      : NextResponse.json(
          { error: "Le calendrier n'est disponible que pour un rendez-vous confirmé." },
          { status: 403 }
        );
  }

  return new NextResponse(buildMeetingIcs(result.input), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
      "Content-Disposition": 'inline; filename="rendez-vous-ceo-summit.ics"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
