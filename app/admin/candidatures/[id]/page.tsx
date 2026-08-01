import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Tier } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { getActivePlans } from "@/lib/plans-query";
import { Badge } from "@/components/ui/badge";
import { CandidatureDecisionPanel } from "@/components/admin/candidature-decision-panel";
import { CandidatureNoteForm } from "@/components/admin/candidature-note-form";
import { formatDateFr, initials, tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Candidature" };

const TIER_BADGE: Record<string, "member" | "executive" | "chairman"> = {
  MEMBER: "member",
  EXECUTIVE: "executive",
  CHAIRMAN: "chairman",
};

const STATUS_BADGE: Record<string, "pending" | "approved" | "refused"> = {
  PENDING: "pending",
  APPROVED: "approved",
  REFUSED: "refused",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Validée",
  REFUSED: "Refusée",
};

/** E8-T03 — détail candidature (wireframe bo-candidature-detail.html, réduit au périmètre backlog). */
export default async function AdminCandidatureDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("candidatures");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const application = await prisma.membershipApplication.findUnique({ where: { id: params.id } });
  if (!application) notFound();

  // Phase 1 offres dynamiques (30 juillet 2026) — les 3 offres legacy sont
  // nommées exactement "MEMBER"/"EXECUTIVE"/"CHAIRMAN" (prisma/backfill-plans.ts),
  // donc lire directement leur prix/crédits par nom reste valable tant que
  // le formulaire de candidature n'a pas encore été migré vers un vrai
  // sélecteur de Plan (MembershipApplication.requestedTier reste un Tier).
  const individualPlans = await getActivePlans("INDIVIDUAL");
  const planByName = new Map(individualPlans.map((p) => [p.name, p]));
  const prices: Record<Tier, number> = {
    MEMBER: planByName.get("MEMBER")?.priceAr ?? 0,
    EXECUTIVE: planByName.get("EXECUTIVE")?.priceAr ?? 0,
    CHAIRMAN: planByName.get("CHAIRMAN")?.priceAr ?? 0,
  };
  const includedCredits: Record<"MEMBER" | "EXECUTIVE", number> = {
    MEMBER: planByName.get("MEMBER")?.includedCredits ?? 0,
    EXECUTIVE: planByName.get("EXECUTIVE")?.includedCredits ?? 0,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/admin/candidatures" className="text-sm text-text-muted">
          ← Candidatures
        </Link>
        <span className="ml-auto flex items-center gap-2">
          <Badge variant={STATUS_BADGE[application.status]}>
            {STATUS_LABEL[application.status]}
          </Badge>
          <span className="text-xs text-text-muted">
            Soumise le {formatDateFr(application.createdAt)}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-white p-6">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-navy-light text-lg font-bold text-navy">
                {initials(application.fullName)}
              </div>
              <div>
                <h1 className="text-xl font-bold text-navy">{application.fullName}</h1>
                <p className="text-sm text-text-muted">
                  {application.title} · {application.companyName}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant={TIER_BADGE[application.requestedTier]}>
                    {tierLabel(application.requestedTier)}
                  </Badge>
                  <span className="text-xs text-text-muted">
                    {application.sector} · {application.country}
                  </span>
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs uppercase text-text-muted">Email</dt>
                <dd>{application.email}</dd>
              </div>
              {application.sponsorName && (
                <div>
                  <dt className="text-xs uppercase text-text-muted">Parrain</dt>
                  <dd>{application.sponsorName}</dd>
                </div>
              )}
            </dl>
          </div>

          {application.motivation && (
            <div className="rounded-lg border border-border bg-white p-6">
              <h2 className="mb-3 text-base font-bold text-navy">Lettre de motivation</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-text-mid">
                {application.motivation}
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-3 text-base font-bold text-navy">Pièces jointes</h2>
            {application.attachments.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune pièce jointe.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {application.attachments.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-navy-mid"
                    >
                      {url.split("/").pop()}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-3 text-base font-bold text-navy">
              Notes internes{" "}
              <span className="text-xs font-normal text-text-muted">(admins uniquement)</span>
            </h2>
            <CandidatureNoteForm
              applicationId={application.id}
              initialNote={application.adminNote ?? ""}
            />
          </div>
        </div>

        <div>
          {application.status === "PENDING" ? (
            <CandidatureDecisionPanel
              applicationId={application.id}
              requestedTier={application.requestedTier}
              prices={prices}
              includedCredits={includedCredits}
            />
          ) : (
            <div className="rounded-lg border border-border bg-white p-5 text-sm text-text-muted">
              Cette candidature a déjà été traitée
              {application.decidedAt && ` le ${formatDateFr(application.decidedAt)}`}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
