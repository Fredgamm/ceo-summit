import { prisma } from "@/lib/prisma";
import { allowedVisibilities } from "@/lib/deal-room-query";
import { getViewerTierFromCompany } from "@/lib/plan-access";
import { meetsRoomAccess } from "@/lib/rooms-query";
import type { Viewer } from "@/lib/require-viewer";

/**
 * Audit sécurité (25 septembre 2026) — contrôle d'accès de
 * `/api/dev/local-storage/<bucket>/<key>` (app/api/dev/local-storage/
 * [...segments]/route.ts). R2 n'étant pas configuré en prod, TOUS les
 * fichiers passent par cette route, y compris les objets "privés"
 * (`uploadPrivateObject`, lib/r2.ts) dont l'URL n'est normalement qu'une
 * URL signée générée après le contrôle d'accès de la page appelante. La
 * route ne vérifiait qu'une session : n'importe quel membre connecté
 * lisait une preuve de paiement ou une pièce jointe Deal Room en devinant
 * (ou en récupérant) son chemin.
 *
 * Décision par préfixe de clé — les préfixes sont ceux que posent les
 * routes d'upload (app/api/**) :
 *   - `avatars/`, `company-logos/`, `events/`, `services/` : images publiques
 *     (`uploadObject`) — tout membre connecté, comme avant ;
 *   - `company-payments/<uploaderId>/` : l'uploader, le gestionnaire
 *     (`Company.companyAdminId`) de l'entreprise du paiement, ou un admin ;
 *   - `deal-room/<uploaderId>/` : mêmes règles que app/deal-room/[id]/page.tsx
 *     (auteur, ou opportunité PUBLISHED visible pour le tier du viewer) ;
 *   - `salles/<roomId>/` : accès à la salle (`meetsRoomAccess`, comme
 *     app/salles/[id]/page.tsx) ;
 *   - `broadcasts/<fichier>` : pièce jointe d'une communication envoyée —
 *     tout membre connecté, à condition qu'un `Broadcast` référence la clé
 *     (un upload jamais envoyé reste invisible) ;
 *   - tout autre préfixe : refusé.
 * Un admin plateforme actif (`AdminUser.active` non `false`, même règle que
 * `requireAdmin()`) est autorisé partout (revue des paiements, modération).
 */

const PUBLIC_PREFIXES = ["avatars", "company-logos", "events", "services"] as const;

/** Séparateurs de chemin (Windows compris) et octet nul. */
const UNSAFE_SEGMENT_CHARS = /[\\/\u0000]/;

export type LocalStorageObject =
  | { kind: "invalid" }
  | { kind: "unknown" }
  | { kind: "public" }
  | { kind: "payment-proof"; key: string; uploaderId: string }
  | { kind: "deal-room"; key: string; uploaderId: string }
  | { kind: "room-attachment"; roomId: string }
  | { kind: "broadcast"; key: string };

/**
 * `segments` = `[bucket, ...key]`, tels que reçus par la route. Rejette tout
 * segment vide, `.`/`..` ou contenant un séparateur : `path.join` les
 * résoudrait côté disque, alors que la classification ci-dessous lit les
 * segments bruts — sans ce rejet, `avatars/../../<bucket>/deal-room/...`
 * serait classé "public" tout en servant une pièce Deal Room.
 */
export function classifyLocalStorageObject(segments: string[]): LocalStorageObject {
  if (
    segments.length < 3 ||
    segments.some((s) => s === "" || s === "." || s === ".." || UNSAFE_SEGMENT_CHARS.test(s))
  ) {
    return { kind: "invalid" };
  }

  const [, prefix, owner] = segments;
  if ((PUBLIC_PREFIXES as readonly string[]).includes(prefix)) return { kind: "public" };
  // Seul préfixe privé à plat (`broadcasts/<uuid>-<nom>`, app/api/broadcasts/attachment).
  if (prefix === "broadcasts") return { kind: "broadcast", key: segments.slice(1).join("/") };

  // Les préfixes privés ont tous la forme `<usage>/<id>/<fichier>`.
  if (segments.length < 4) return { kind: "unknown" };
  const key = segments.slice(1).join("/");
  if (prefix === "company-payments") return { kind: "payment-proof", key, uploaderId: owner };
  if (prefix === "deal-room") return { kind: "deal-room", key, uploaderId: owner };
  if (prefix === "salles") return { kind: "room-attachment", roomId: owner };
  return { kind: "unknown" };
}

export interface LocalStorageAccessLookups {
  isActivePlatformAdmin(viewer: Viewer): Promise<boolean>;
  findPaymentsByProofKey(
    key: string
  ): Promise<{ submittedById: string; companyAdminId: string | null }[]>;
  findOpportunitiesByAttachment(
    key: string
  ): Promise<{ authorId: string; status: string; visibility: string }[]>;
  findRoom(roomId: string): Promise<{ status: string; minTier: string } | null>;
  isSentBroadcastAttachment(key: string): Promise<boolean>;
}

export const prismaLocalStorageLookups: LocalStorageAccessLookups = {
  async isActivePlatformAdmin(viewer) {
    if (!viewer.isPlatformAdmin) return false;
    const adminUser = await prisma.adminUser.findUnique({ where: { userId: viewer.id } });
    return adminUser?.active !== false;
  },
  async findPaymentsByProofKey(key) {
    const payments = await prisma.companyPayment.findMany({
      where: { proofFileKey: key },
      select: {
        submittedById: true,
        companySubscription: { select: { company: { select: { companyAdminId: true } } } },
      },
    });
    return payments.map((p) => ({
      submittedById: p.submittedById,
      companyAdminId: p.companySubscription.company.companyAdminId,
    }));
  },
  async findOpportunitiesByAttachment(key) {
    return prisma.opportunity.findMany({
      where: { attachments: { has: key } },
      select: { authorId: true, status: true, visibility: true },
    });
  },
  async findRoom(roomId) {
    return prisma.room.findUnique({
      where: { id: roomId },
      select: { status: true, minTier: true },
    });
  },
  async isSentBroadcastAttachment(key) {
    const count = await prisma.broadcast.count({ where: { attachmentKeys: { has: key } } });
    return count > 0;
  },
};

export async function canAccessLocalStorageObject(
  viewer: Viewer,
  segments: string[],
  lookups: LocalStorageAccessLookups = prismaLocalStorageLookups
): Promise<boolean> {
  const object = classifyLocalStorageObject(segments);
  if (object.kind === "invalid") return false;
  if (object.kind === "public") return true;
  if (await lookups.isActivePlatformAdmin(viewer)) return true;

  switch (object.kind) {
    case "unknown":
      return false;

    case "payment-proof": {
      if (object.uploaderId === viewer.id) return true;
      const payments = await lookups.findPaymentsByProofKey(object.key);
      return payments.some((p) => p.submittedById === viewer.id || p.companyAdminId === viewer.id);
    }

    case "deal-room": {
      if (object.uploaderId === viewer.id) return true;
      const viewerTier = getViewerTierFromCompany(viewer.company);
      const visible = allowedVisibilities(viewerTier) as readonly string[];
      const opportunities = await lookups.findOpportunitiesByAttachment(object.key);
      return opportunities.some(
        (o) =>
          o.authorId === viewer.id || (o.status === "PUBLISHED" && visible.includes(o.visibility))
      );
    }

    case "room-attachment": {
      const room = await lookups.findRoom(object.roomId);
      if (!room || room.status !== "ACTIVE") return false;
      return meetsRoomAccess(
        getViewerTierFromCompany(viewer.company),
        room.minTier as Parameters<typeof meetsRoomAccess>[1]
      );
    }

    case "broadcast":
      return lookups.isSentBroadcastAttachment(object.key);
  }
}
