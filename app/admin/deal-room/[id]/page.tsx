import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { getSignedDownloadUrl } from "@/lib/r2";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { OpportunityChecklist } from "@/components/admin/deal-room/opportunity-checklist";
import { OpportunityDecisionPanel } from "@/components/admin/deal-room/opportunity-decision-panel";
import { ModerationNoteForm } from "@/components/admin/deal-room/moderation-note-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatAriary, formatDateFr, initials, tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Examiner une opportunité" };

const STATUS_LABEL: Record<string, string> = {
  PENDING_MODERATION: "En attente de validation",
  PUBLISHED: "Publiée",
  CHANGES_REQUESTED: "Modifications demandées",
  REFUSED: "Refusée",
  UNPUBLISHED: "Dépubliée",
  EXPIRED: "Expirée",
};

const TIER_BADGE: Record<string, "member" | "executive" | "chairman"> = {
  MEMBER: "member",
  EXECUTIVE: "executive",
  CHAIRMAN: "chairman",
};

/** E8-T06 — fiche d'examen : contenu, checklist, décision, navigation dans la file. */
export default async function AdminOpportunityDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("deal-room");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const opportunity = await prisma.opportunity.findUnique({
    where: { id: params.id },
    include: {
      author: { include: VIEWER_TIER_INCLUDE },
    },
  });
  if (!opportunity) notFound();

  const isPending = opportunity.status === "PENDING_MODERATION";

  const [publishedCount, refusedCount, contactsReceived, queue] = await Promise.all([
    prisma.opportunity.count({ where: { authorId: opportunity.authorId, status: "PUBLISHED" } }),
    prisma.opportunity.count({ where: { authorId: opportunity.authorId, status: "REFUSED" } }),
    prisma.opportunityContact.count({ where: { receiverId: opportunity.authorId } }),
    isPending
      ? prisma.opportunity.findMany({
          where: { status: "PENDING_MODERATION" },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const queueIndex = queue.findIndex((o) => o.id === opportunity.id);
  const prevId = queueIndex > 0 ? queue[queueIndex - 1].id : null;
  const nextId = queueIndex >= 0 && queueIndex < queue.length - 1 ? queue[queueIndex + 1].id : null;

  const authorTier = getViewerTierFromCompany(opportunity.author.company);

  // B4 (audit du 29 juillet 2026) — see app/deal-room/[id]/page.tsx for the
  // member-facing equivalent; same private-key → signed-URL resolution.
  const attachmentLinks = await Promise.all(
    opportunity.attachments.map(async (key) => ({
      key,
      name: key.split("/").pop() ?? key,
      url: await getSignedDownloadUrl(
        process.env.R2_BUCKET_DOCUMENTS ?? "ceo-summit-documents",
        key
      ),
    }))
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/deal-room" className="text-text-muted">
          Deal Room
        </Link>
        <span className="text-text-muted">/</span>
        <span className="font-semibold text-navy">{opportunity.title}</span>
        <Badge className="ml-auto" variant={isPending ? "pending" : "secondary"}>
          {STATUS_LABEL[opportunity.status] ?? opportunity.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-white p-6">
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{opportunity.type}</Badge>
              <Badge variant="secondary">{opportunity.sector}</Badge>
              <Badge variant="secondary">{opportunity.country}</Badge>
            </div>
            <h2 className="mb-3 text-xl font-bold text-navy">{opportunity.title}</h2>
            <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-text-mid">
              {opportunity.description}
            </p>

            <div className="mb-4 grid grid-cols-2 gap-3">
              {opportunity.budget != null && (
                <div className="rounded-md bg-surface p-3">
                  <p className="mb-1 text-xs font-bold uppercase text-text-muted">Budget</p>
                  <p className="font-bold text-navy">{formatAriary(opportunity.budget)}</p>
                </div>
              )}
              {opportunity.deadline && (
                <div className="rounded-md bg-surface p-3">
                  <p className="mb-1 text-xs font-bold uppercase text-text-muted">Échéance</p>
                  <p className="font-bold text-navy">{formatDateFr(opportunity.deadline)}</p>
                </div>
              )}
              <div className="rounded-md bg-surface p-3">
                <p className="mb-1 text-xs font-bold uppercase text-text-muted">Visibilité</p>
                <p className="font-bold text-navy">{tierLabel(opportunity.visibility)}+</p>
              </div>
              <div className="rounded-md bg-surface p-3">
                <p className="mb-1 text-xs font-bold uppercase text-text-muted">Soumise le</p>
                <p className="font-bold text-navy">{formatDateFr(opportunity.createdAt)}</p>
              </div>
            </div>

            {attachmentLinks.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-bold uppercase text-text-muted">Documents joints</p>
                <ul className="flex flex-col gap-2">
                  {attachmentLinks.map((a) => (
                    <li key={a.key}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-navy-mid"
                      >
                        📄 {a.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-xs font-bold uppercase text-text-muted">
              Auteur de l&apos;opportunité
            </p>
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={opportunity.author.avatarUrl ?? undefined}
                  alt={opportunity.author.name}
                />
                <AvatarFallback>{initials(opportunity.author.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-navy">{opportunity.author.name}</p>
                <p className="text-xs text-text-muted">{opportunity.author.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  {authorTier && (
                    <Badge variant={TIER_BADGE[authorTier]}>{tierLabel(authorTier)}</Badge>
                  )}
                  <span className="text-xs text-text-muted">
                    Membre depuis {formatDateFr(opportunity.author.createdAt)}
                  </span>
                </div>
              </div>
              <Link
                href={`/admin/membres/${opportunity.author.id}`}
                className="ml-auto text-sm text-navy-mid"
              >
                Voir profil admin →
              </Link>
            </div>
            <div className="mt-3 flex gap-5 border-t border-border pt-3 text-xs text-text-muted">
              <span>
                Opps publiées : <strong className="text-text-dark">{publishedCount}</strong>
              </span>
              <span>
                Opps refusées : <strong className="text-red-600">{refusedCount}</strong>
              </span>
              <span>
                Contacts reçus : <strong className="text-text-dark">{contactsReceived}</strong>
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-2 text-sm font-bold text-navy">
              Note de modération{" "}
              <span className="font-normal text-text-muted">(interne admin)</span>
            </p>
            <ModerationNoteForm
              opportunityId={opportunity.id}
              initialNote={opportunity.moderationNote ?? ""}
            />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          {isPending && <OpportunityDecisionPanel opportunityId={opportunity.id} />}

          <div className="rounded-lg border border-border bg-white p-5">
            <p className="mb-3 text-sm font-bold text-navy">Checklist modération</p>
            <OpportunityChecklist />
          </div>

          {isPending && queue.length > 0 && (
            <div className="rounded-lg border border-border bg-white p-5">
              <p className="mb-3 text-sm font-bold text-navy">Navigation modération</p>
              <p className="mb-3 text-xs text-text-muted">
                {queue.length} opportunité{queue.length !== 1 ? "s" : ""} en attente · Vous examinez{" "}
                {queueIndex + 1}/{queue.length}
              </p>
              <div className="flex gap-2">
                {prevId ? (
                  <Link
                    href={`/admin/deal-room/${prevId}`}
                    className="flex-1 rounded-md border border-border py-1.5 text-center text-sm text-text-mid"
                  >
                    ‹ Précédente
                  </Link>
                ) : (
                  <span className="flex-1 rounded-md border border-border py-1.5 text-center text-sm text-text-muted opacity-50">
                    ‹ Précédente
                  </span>
                )}
                {nextId ? (
                  <Link
                    href={`/admin/deal-room/${nextId}`}
                    className="flex-1 rounded-md border border-border py-1.5 text-center text-sm text-text-mid"
                  >
                    Suivante ›
                  </Link>
                ) : (
                  <span className="flex-1 rounded-md border border-border py-1.5 text-center text-sm text-text-muted opacity-50">
                    Suivante ›
                  </span>
                )}
              </div>
              <Link
                href="/admin/deal-room"
                className="mt-3 block text-center text-xs text-navy-mid"
              >
                ← Retour à la file
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
