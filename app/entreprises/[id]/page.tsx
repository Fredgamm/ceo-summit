import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Briefcase, Globe, Handshake } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { getOnboardingStatus } from "@/lib/onboarding-status";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { computeEffectiveStatus } from "@/lib/company-subscription-status";
import { seatCap } from "@/lib/company-seats";
import { UPSELL_ELIGIBLE_WHERE } from "@/lib/upsell-plans";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberCard } from "@/components/catalogue/member-card";
import { InviteTeammateForm } from "@/components/entreprise/invite-teammate-form";
import { AdminParticipatesToggle } from "@/components/entreprise/admin-participates-toggle";
import { UpsellPurchaseForm } from "@/components/entreprise/upsell-purchase-form";
import { OnboardingStatusList } from "@/components/entreprise/onboarding-status-list";
import { initials, tierLabel, formatAriary } from "@/lib/utils";

const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Aucune offre choisie",
  PENDING_PAYMENT: "En attente de paiement",
  PENDING_REVIEW: "Paiement en cours de validation",
  ACTIVE: "Active",
  EXPIRED: "Expirée",
  SUSPENDED: "Suspendue",
  CANCELLED: "Annulée",
};

const SUBSCRIPTION_STATUS_BADGE: Record<string, "active" | "pending" | "refused" | "draft"> = {
  DRAFT: "draft",
  PENDING_PAYMENT: "pending",
  PENDING_REVIEW: "pending",
  ACTIVE: "active",
  EXPIRED: "refused",
  SUSPENDED: "refused",
  CANCELLED: "refused",
};

export const metadata: Metadata = { title: "Profil entreprise" };

/**
 * E2-T05 — profil entreprise. Deal Room and Services tabs are placeholders
 * for the same reason as /membres/[id] (E2-T01): E5/E6 don't exist yet.
 */
const TAB_VALUES = ["apercu", "membres", "deal-room", "services", "gestion"] as const;

export default async function CompanyProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      users: {
        where: { status: "ACTIVE" },
        select: { id: true, name: true, title: true, avatarUrl: true, country: true, role: true },
      },
      subscription: { include: { plan: { include: { event: true } } } },
      invites: { where: { status: "PENDING" }, select: { id: true, name: true, email: true } },
      _count: { select: { invites: true } },
    },
  });
  if (!company) notFound();

  const isCompanyAdmin = company.companyAdminId === viewer.id;
  const applicableCap = company.subscription ? seatCap(company.subscription) : null;
  // 22 septembre 2026 (`conception/12` §3.3) — le gestionnaire ne consomme
  // une place que s'il a coché « Je participe ».
  const usedSeats =
    company.users.filter((u) => company.adminParticipates || u.id !== company.companyAdminId)
      .length + company.invites.length;
  const upsellPlans = isCompanyAdmin
    ? await prisma.plan.findMany({
        where: UPSELL_ELIGIBLE_WHERE,
        orderBy: { displayOrder: "asc" },
      })
    : [];
  // Deep-link support (?tab=gestion) so links elsewhere (e.g. the
  // dashboard's "Mon équipe" widget) can land directly on a specific tab —
  // "gestion" only honored for the company admin, who's the only one who
  // sees that tab at all.
  const requestedTab = searchParams.tab;
  const defaultTab =
    requestedTab &&
    (TAB_VALUES as readonly string[]).includes(requestedTab) &&
    (requestedTab !== "gestion" || isCompanyAdmin)
      ? requestedTab
      : "apercu";
  const unreadMessages = await countUnreadMessages(viewer.id);
  const subscriptionStatus = company.subscription
    ? computeEffectiveStatus(company.subscription.status, company.subscription.plan.event?.date)
    : undefined;

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(getViewerTierFromCompany(viewer.company)),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <div className="mb-4 flex items-start gap-4 rounded-lg border border-border bg-white p-6">
        <Avatar className="h-16 w-16 shrink-0 rounded-xl">
          <AvatarImage src={company.logoUrl ?? undefined} alt={company.name} />
          <AvatarFallback className="rounded-xl">{initials(company.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-navy">{company.name}</h1>
          <p className="text-sm text-text-muted">
            {[company.sector, company.country].filter(Boolean).join(" · ")}
          </p>
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-navy-mid"
            >
              <Globe className="h-3.5 w-3.5" /> {company.website}
            </a>
          )}
        </div>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="apercu">Aperçu</TabsTrigger>
          <TabsTrigger value="membres">Membres ({company.users.length})</TabsTrigger>
          <TabsTrigger value="deal-room">Opportunités</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          {isCompanyAdmin && <TabsTrigger value="gestion">Gestion</TabsTrigger>}
        </TabsList>

        <TabsContent value="apercu">
          <div className="rounded-lg border border-border bg-white p-6">
            {company.description ? (
              <p className="text-sm leading-relaxed text-text">{company.description}</p>
            ) : (
              <p className="text-sm text-text-muted">Aucune description renseignée.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="membres">
          {company.users.length === 0 ? (
            <EmptyState title="Aucun membre CEO Summit rattaché à cette entreprise" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {company.users.map((u) => (
                <MemberCard
                  key={u.id}
                  id={u.id}
                  name={u.name}
                  title={u.title}
                  companyName={null}
                  country={u.country}
                  avatarUrl={u.avatarUrl}
                  role={u.role}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deal-room">
          <EmptyState
            icon={Handshake}
            title="Bientôt disponible"
            description="Les opportunités Deal Room liées à cette entreprise s'afficheront ici."
          />
        </TabsContent>

        <TabsContent value="services">
          <EmptyState
            icon={Briefcase}
            title="Bientôt disponible"
            description="Les services proposés par cette entreprise s'afficheront ici."
          />
        </TabsContent>

        {isCompanyAdmin && (
          <TabsContent value="gestion">
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-border bg-white p-5">
                <h2 className="mb-3 text-sm font-bold text-navy">Statut du dossier</h2>
                <OnboardingStatusList
                  items={getOnboardingStatus({
                    hasCompany: true,
                    hasInvites: company._count.invites > 0,
                    subscriptionStatus,
                  })}
                />
              </div>

              <div className="rounded-lg border border-border bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-navy">Abonnement</h2>
                  <Badge variant={SUBSCRIPTION_STATUS_BADGE[subscriptionStatus ?? "DRAFT"]}>
                    {SUBSCRIPTION_STATUS_LABEL[subscriptionStatus ?? "DRAFT"]}
                  </Badge>
                </div>
                {company.subscription ? (
                  <p className="text-sm text-text-mid">
                    {company.subscription.plan.name} —{" "}
                    {formatAriary(company.subscription.plan.priceAr)}
                    {company.subscription.plan.pricingMode === "PER_PARTICIPANT" &&
                      " par participant"}
                  </p>
                ) : (
                  <p className="text-sm text-text-muted">
                    Aucune offre choisie pour l&apos;instant.
                  </p>
                )}
                <div className="mt-3">
                  {!company.subscription && (
                    <Button asChild size="sm">
                      <Link href="/entreprise/paiement">Choisir une offre</Link>
                    </Button>
                  )}
                  {company.subscription && subscriptionStatus !== "ACTIVE" && (
                    <Button asChild size="sm">
                      <Link href="/entreprise/paiement">
                        {company.subscription.status === "PENDING_PAYMENT"
                          ? "Soumettre le paiement"
                          : subscriptionStatus === "EXPIRED"
                            ? "Renouveler pour la prochaine édition"
                            : "Voir / changer d'offre"}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-navy">Participants à l&apos;évènement</h2>
                  {applicableCap != null && (
                    <span className="text-xs font-semibold text-text-muted">
                      {usedSeats} / {applicableCap} place(s)
                    </span>
                  )}
                </div>
                <div className="mb-4">
                  <AdminParticipatesToggle
                    companyId={company.id}
                    participates={company.adminParticipates}
                  />
                </div>
                <InviteTeammateForm companyId={company.id} pendingInvites={company.invites} />
              </div>

              {company.subscription &&
                (subscriptionStatus === "ACTIVE" || subscriptionStatus === "EXPIRED") &&
                upsellPlans.length > 0 &&
                applicableCap != null &&
                usedSeats >= applicableCap && (
                  <div className="rounded-lg border border-border bg-white p-5">
                    <h2 className="mb-1 text-sm font-bold text-navy">
                      Ajouter des places supplémentaires
                    </h2>
                    <p className="mb-3 text-xs text-text-muted">
                      Vous avez atteint les {applicableCap} place(s) de votre offre. Pour ajouter
                      d&apos;autres participants, veuillez choisir une offre ci-dessous.
                    </p>
                    <UpsellPurchaseForm
                      companySubscriptionId={company.subscription.id}
                      upsellPlans={upsellPlans}
                    />
                  </div>
                )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </AppShell>
  );
}
