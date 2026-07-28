import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
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

          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-3 text-base font-bold text-navy">Lettre de motivation</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-mid">
              {application.motivation}
            </p>
          </div>

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
