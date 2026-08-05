import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { buildActivityFeed } from "@/lib/admin-dashboard";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberActionsPanel } from "@/components/admin/member-actions-panel";
import { MemberNoteForm } from "@/components/admin/member-note-form";
import { formatAriary, formatDateFr, initials, tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Membre" };

const TIER_BADGE: Record<string, "member" | "executive" | "chairman"> = {
  MEMBER: "member",
  EXECUTIVE: "executive",
  CHAIRMAN: "chairman",
};

const STATUS_BADGE: Record<string, "active" | "suspended" | "pending" | "refused" | "draft"> = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  PENDING_ACTIVATION: "pending",
  CANCELLED: "refused",
  EXPIRED: "draft",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  PENDING_ACTIVATION: "En attente",
  CANCELLED: "Exclu",
  EXPIRED: "Expiré",
};

/** E8-T04 — détail membre (5 onglets, wireframe bo-membre-detail.html réduit au périmètre backlog). */
export default async function AdminMemberDetailPage({ params }: { params: { id: string } }) {
  try {
    await requireAdmin("membres");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const member = await prisma.user.findUnique({
    where: { id: params.id },
    include: {
      creditBalance: true,
      creditTransactions: { orderBy: { createdAt: "desc" }, take: 10 },
      eventRegistrations: {
        orderBy: { createdAt: "desc" },
        include: { event: { select: { title: true, price: true } } },
      },
      ...VIEWER_TIER_INCLUDE,
    },
  });
  if (!member) notFound();

  const tier = getViewerTierFromCompany(member.company);
  const available = member.creditBalance
    ? member.creditBalance.included + member.creditBalance.purchased - member.creditBalance.used
    : 0;

  const activity = buildActivityFeed(
    member.eventRegistrations.map((r) => ({
      type: "registration",
      message: `Inscription à ${r.event.title}`,
      date: r.createdAt,
    })),
    10
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-white p-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
            <AvatarFallback className="text-lg">{initials(member.name)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold text-navy">{member.name}</h1>
            <p className="text-sm text-text-muted">
              {[member.title, member.company?.name, member.country].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              {tier && <Badge variant={TIER_BADGE[tier]}>{tierLabel(tier)}</Badge>}
              <Badge variant={STATUS_BADGE[member.status]}>{STATUS_LABEL[member.status]}</Badge>
              <span className="text-xs text-text-muted">
                Membre depuis {formatDateFr(member.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <Tabs defaultValue="profil">
          <TabsList>
            <TabsTrigger value="profil">Profil</TabsTrigger>
            <TabsTrigger value="activite">Activité</TabsTrigger>
            <TabsTrigger value="credits">Crédits</TabsTrigger>
            <TabsTrigger value="paiements">Paiements</TabsTrigger>
            <TabsTrigger value="notes">Notes admin</TabsTrigger>
          </TabsList>

          <TabsContent value="profil">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-6 text-sm">
              <Row label="Email" value={member.email} />
              <Row label="Téléphone" value={member.phone ?? "—"} />
              <Row label="LinkedIn" value={member.linkedinUrl ?? "—"} />
              <Row label="Secteurs" value={member.sectors.join(", ") || "—"} />
              <Row label="Bio" value={member.bio ?? "—"} />
            </div>
          </TabsContent>

          <TabsContent value="activite">
            {activity.length === 0 ? (
              <EmptyState title="Aucune activité pour l'instant" />
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-6">
                {activity.map((item, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    <div>
                      <p className="text-text">{item.message}</p>
                      <p className="text-xs text-text-muted">{formatDateFr(item.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="credits">
            <div className="rounded-lg border border-border bg-white p-6">
              <p className="mb-4 text-2xl font-bold text-navy">
                {tier === "CHAIRMAN" ? "∞" : available}
                <span className="ml-1 text-sm font-normal text-text-muted">
                  crédits disponibles
                </span>
              </p>
              {member.creditTransactions.length === 0 ? (
                <p className="text-sm text-text-muted">Aucune transaction.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {member.creditTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p>{tx.reason ?? tx.type}</p>
                        <p className="text-xs text-text-muted">{formatDateFr(tx.createdAt)}</p>
                      </div>
                      <span
                        className={
                          tx.amount >= 0
                            ? "font-semibold text-emerald-700"
                            : "font-semibold text-red-700"
                        }
                      >
                        {tx.amount >= 0 ? "+" : ""}
                        {tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="paiements">
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-border bg-white p-6">
                <h2 className="mb-3 text-sm font-bold uppercase text-text-muted">
                  Abonnement entreprise
                </h2>
                {member.company ? (
                  <p className="text-sm text-text-mid">
                    Les paiements et le statut d&apos;abonnement se gèrent au niveau de
                    l&apos;entreprise —{" "}
                    <Link href={`/entreprises/${member.company.id}`} className="text-navy-mid">
                      voir la fiche {member.company.name} →
                    </Link>
                  </p>
                ) : (
                  <p className="text-sm text-text-muted">Aucune entreprise associée.</p>
                )}
              </div>

              <div className="rounded-lg border border-border bg-white p-6">
                <h2 className="mb-3 text-sm font-bold uppercase text-text-muted">Événements</h2>
                {member.eventRegistrations.length === 0 ? (
                  <p className="text-sm text-text-muted">Aucune inscription événement.</p>
                ) : (
                  member.eventRegistrations.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0"
                    >
                      <p>{r.event.title}</p>
                      <span className="text-text-muted">
                        {r.event.price === 0 ? "Gratuit" : formatAriary(r.event.price)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notes">
            <div className="rounded-lg border border-border bg-white p-6">
              <MemberNoteForm userId={member.id} initialNote={member.adminNote ?? ""} />
            </div>
          </TabsContent>
        </Tabs>

        <MemberActionsPanel userId={member.id} status={member.status} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-text-muted">{label}</p>
      <p>{value}</p>
    </div>
  );
}
