import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Globe, Handshake } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { getOnboardingStatus } from "@/lib/onboarding-status";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { computeEffectiveStatus } from "@/lib/company-subscription-status";
import {
  seatCap,
  countUsedSeats,
  INVITES_REQUIRE_ACTIVE_SUBSCRIPTION_MESSAGE,
} from "@/lib/company-seats";
import { safeHref } from "@/lib/normalize-url";
import { UPSELL_ELIGIBLE_WHERE } from "@/lib/upsell-plans";
import { getEurToArRate } from "@/lib/currency-conversion";
import { getReferentialLabels } from "@/lib/referentials-query";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberCard } from "@/components/catalogue/member-card";
import { InviteTeammateForm } from "@/components/entreprise/invite-teammate-form";
import { EventParticipantsForm } from "@/components/entreprise/event-participants-form";
import { UpsellPurchaseForm } from "@/components/entreprise/upsell-purchase-form";
import { CompanyForm } from "@/components/entreprise/company-form";
import { CompanyServicesManager } from "@/components/entreprise/company-services-manager";
import { OnboardingStatusList } from "@/components/entreprise/onboarding-status-list";
import { initials, formatDateFr, formatEuro, planPriceEur } from "@/lib/utils";
import { offerBadgeLabel } from "@/lib/offer-badge";
import { evoliaPaymentUrl } from "@/lib/evolia";
import { EvoliaPendingPayment } from "@/components/entreprise/evolia-pending-payment";
import { isEvoliaPaymentMethod } from "@/lib/payment-methods";

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
const TAB_VALUES = ["apercu", "membres", "deal-room", "services", "gestion", "modifier"] as const;
/** Onglets réservés au gérant de l'entreprise — rapport QA du 1er oct. §2.2. */
const ADMIN_ONLY_TABS: readonly string[] = ["gestion", "modifier"];

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
  // `/entreprises` reste ouvert sans offre active (middleware.ts) pour que le
  // gérant finisse de configurer sa propre fiche ; les autres fiches, elles,
  // sont réservées aux membres d'une entreprise ayant une offre active.
  const hasPlatformAccess =
    session.user.isPlatformAdmin || getViewerTierFromCompany(viewer.company) !== null;
  if (!hasPlatformAccess && viewer.companyId !== params.id) redirect("/paiement-en-attente");

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
  // Rapport QA 1er oct. §2.5 — le gérant voit toutes ses fiches (y compris
  // brouillon/en attente/refusée), les autres visiteurs ne voient que les
  // fiches déjà publiées (cohérent avec /catalogue/services).
  const services = await prisma.serviceListing.findMany({
    where: { companyId: company.id, ...(isCompanyAdmin ? {} : { status: "PUBLISHED" }) },
    orderBy: { createdAt: "desc" },
  });
  const applicableCap = company.subscription ? seatCap(company.subscription) : null;
  // Audit (25 septembre 2026) — même décompte que `inviteTeammate`
  // (`countUsedSeats`) : jusqu'ici, la page ne comptait que les comptes
  // ACTIVE et toutes les invitations PENDING, même expirées, et affichait
  // donc un autre total que celui qui bloquait réellement l'invitation.
  const usedSeats = isCompanyAdmin ? await countUsedSeats(company) : 0;
  const upsellPlans = isCompanyAdmin
    ? await prisma.plan.findMany({
        where: UPSELL_ELIGIBLE_WHERE,
        orderBy: { displayOrder: "asc" },
      })
    : [];
  const liveEurToArRate = await getEurToArRate();
  // Audit (25 septembre 2026) — un seul supplément en attente à la fois
  // (voir `purchaseUpsellSeats`) : affiché à la place du formulaire.
  const pendingUpsellPayment =
    isCompanyAdmin && company.subscription
      ? await prisma.companyPayment.findFirst({
          where: {
            companySubscriptionId: company.subscription.id,
            status: "PENDING",
            upsellQuantity: { not: null },
          },
          select: { id: true, upsellQuantity: true, method: true, createdAt: true },
        })
      : null;
  // Rapport QA 1er oct. §2.2 — référentiels pour l'onglet "Modifier" (CompanyForm mode="edit").
  const [sectors, countries] = isCompanyAdmin
    ? await Promise.all([getReferentialLabels("sector"), getReferentialLabels("country")])
    : [[], []];
  const websiteHref = safeHref(company.website);
  // Deep-link support (?tab=gestion) so links elsewhere (e.g. the
  // dashboard's "Mon équipe" widget) can land directly on a specific tab —
  // "gestion"/"modifier" only honored for the company admin, who's the only
  // one who sees these tabs at all.
  const requestedTab = searchParams.tab;
  const defaultTab =
    requestedTab &&
    (TAB_VALUES as readonly string[]).includes(requestedTab) &&
    (!ADMIN_ONLY_TABS.includes(requestedTab) || isCompanyAdmin)
      ? requestedTab
      : "apercu";
  const unreadMessages = await countUnreadMessages(viewer.id);
  // Module 18 §4.9 — liste des participants à l'événement de l'offre, gérée par le gérant.
  const linkedEvent =
    isCompanyAdmin && company.subscription?.plan.event ? company.subscription.plan.event : null;
  const eventParticipantIds = linkedEvent
    ? (
        await prisma.eventRegistration.findMany({
          where: {
            eventId: linkedEvent.id,
            status: "CONFIRMED",
            userId: { in: company.users.map((u) => u.id) },
          },
          select: { userId: true },
        })
      ).map((r) => r.userId)
    : [];
  const subscriptionStatus = company.subscription
    ? computeEffectiveStatus(company.subscription.status, company.subscription.plan.event?.date)
    : undefined;

  return (
    <AppShell
      user={{
        name: viewer.name,
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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-navy">{company.name}</h1>
            {offerBadgeLabel(company.subscription) && (
              <Badge variant="chairman">{offerBadgeLabel(company.subscription)}</Badge>
            )}
          </div>
          <p className="text-sm text-text-muted">
            {[company.sector, company.country].filter(Boolean).join(" · ")}
          </p>
          {websiteHref && (
            <a
              href={websiteHref}
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
          {isCompanyAdmin && <TabsTrigger value="gestion">Gestion compte</TabsTrigger>}
          {isCompanyAdmin && <TabsTrigger value="modifier">Modifier</TabsTrigger>}
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
          <CompanyServicesManager services={services} isCompanyAdmin={isCompanyAdmin} />
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
                    {formatEuro(planPriceEur(company.subscription.plan, liveEurToArRate))}
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
                {linkedEvent && subscriptionStatus === "ACTIVE" && company.subscription && (
                  <div className="mb-5">
                    <p className="mb-1 text-sm font-semibold text-navy">{linkedEvent.title}</p>
                    <p className="mb-3 text-xs text-text-muted">
                      Cochez les personnes qui participeront à l&apos;événement, puis validez.
                      Chaque nouveau participant reçoit une confirmation, et la liste est transmise
                      pour les badges.
                    </p>
                    <EventParticipantsForm
                      companyId={company.id}
                      candidates={company.users.map((u) => ({
                        id: u.id,
                        name: u.name,
                        title: u.title,
                        isManager: u.id === company.companyAdminId,
                      }))}
                      initialSelected={eventParticipantIds}
                      cap={applicableCap}
                      validatedAtLabel={
                        company.subscription.participantsValidatedAt
                          ? formatDateFr(company.subscription.participantsValidatedAt)
                          : null
                      }
                    />
                  </div>
                )}
                {/* Audit (25 septembre 2026) — collaborateurs rassemblés après
                    paiement (BACKLOG_MVP §3), comme `inviteTeammate`. */}
                {subscriptionStatus === "ACTIVE" ? (
                  <InviteTeammateForm companyId={company.id} pendingInvites={company.invites} />
                ) : (
                  <Alert>
                    <AlertDescription>
                      {INVITES_REQUIRE_ACTIVE_SUBSCRIPTION_MESSAGE}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {company.subscription &&
                subscriptionStatus === "ACTIVE" &&
                (pendingUpsellPayment ? (
                  <div className="rounded-lg border border-border bg-white p-5">
                    <h2 className="mb-1 text-sm font-bold text-navy">
                      Ajouter des places supplémentaires
                    </h2>
                    <p className="text-sm text-text-mid">
                      Supplément de {pendingUpsellPayment.upsellQuantity} place(s) en attente de
                      validation.
                    </p>
                    {isEvoliaPaymentMethod(pendingUpsellPayment.method) && (
                      <div className="mt-2 flex flex-col gap-2">
                        <p className="text-sm text-text-mid">
                          Paiement en cours chez Evolia, confirmé automatiquement.
                        </p>
                        <EvoliaPendingPayment
                          paymentId={pendingUpsellPayment.id}
                          paymentUrl={evoliaPaymentUrl(pendingUpsellPayment.id)}
                          startedAt={pendingUpsellPayment.createdAt.toISOString()}
                        />
                      </div>
                    )}
                  </div>
                ) : (
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
                        liveEurToArRate={liveEurToArRate}
                      />
                    </div>
                  )
                ))}
            </div>
          </TabsContent>
        )}

        {isCompanyAdmin && (
          <TabsContent value="modifier">
            <CompanyForm
              mode="edit"
              companyId={company.id}
              initialValues={{
                name: company.name,
                sector: company.sector,
                country: company.country,
                description: company.description ?? "",
                website: company.website ?? "",
                logoUrl: company.logoUrl ?? "",
                phone: company.phone ?? "",
                address: company.address ?? "",
                linkedinUrl: (company.socialLinks as Record<string, string> | null)?.linkedin ?? "",
                facebookUrl: (company.socialLinks as Record<string, string> | null)?.facebook ?? "",
                instagramUrl:
                  (company.socialLinks as Record<string, string> | null)?.instagram ?? "",
                additionalInfo: company.additionalInfo ?? "",
              }}
              sectors={sectors}
              countries={countries}
            />
          </TabsContent>
        )}
      </Tabs>
    </AppShell>
  );
}
