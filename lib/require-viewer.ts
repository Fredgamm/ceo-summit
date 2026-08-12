import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";

export type Viewer = Prisma.UserGetPayload<{ include: typeof VIEWER_TIER_INCLUDE }>;

type RequireViewerResult = { success: true; viewer: Viewer } | { success: false; error: string };

/**
 * Boilerplate "session → fetch viewer → check auth" copiée telle quelle
 * dans ~6 fichiers d'actions (credits.ts, deal-room.ts, services.ts,
 * broadcasts.ts, events.ts) — regroupée ici, sur le modèle de
 * `requireAdmin()` (lib/admin-auth.ts) côté admin.
 *
 * Correctif (7 août 2026, audit) — au-delà de la déduplication, ferme un
 * vrai trou : `suspendMember`/`excludeMember` (app/actions/members.ts) ne
 * mettent à jour que `User.status` en base, jamais la session JWT (24h,
 * revalidée seulement à la connexion suivante — voir auth.config.ts). Un
 * membre déjà connecté au moment de sa suspension/exclusion gardait donc
 * accès à toute action qui ne vérifiait que `session.user.id`. Chaque appel
 * ici relit `User.status` en base, comme `requireAdmin()` le fait déjà pour
 * `AdminUser.active` — ne couvre que les actions migrées vers ce helper,
 * pas la navigation de pages (middleware.ts, en edge runtime, ne peut pas
 * interroger Prisma — limite documentée, pas ce que ce correctif adresse).
 */
export async function requireViewer(): Promise<RequireViewerResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer || viewer.status !== "ACTIVE") {
    return { success: false, error: "Non authentifié." };
  }

  return { success: true, viewer };
}
