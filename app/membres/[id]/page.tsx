import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { Building2, Globe, Handshake, Linkedin, Mail, Phone, Plus } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { safeHref } from "@/lib/normalize-url";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { offerBadgeLabel } from "@/lib/offer-badge";
import { profileCompleteness } from "@/lib/profile-completeness";
import { AppShell } from "@/components/layout/app-shell";
import { OpportunityCard } from "@/components/deal-room/opportunity-card";
import { CompanyServicesManager } from "@/components/entreprise/company-services-manager";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateFr, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Profil membre" };

const OPPORTUNITY_STATUS_LABEL: Record<string, string> = {
  PENDING_MODERATION: "En attente de validation",
  CHANGES_REQUESTED: "Modifications demandées",
  REFUSED: "Refusée",
  UNPUBLISHED: "Dépubliée",
  EXPIRED: "Expirée",
};

/**
 * Profil d'un membre, et page « Mon profil » (/profil) quand il s'agit du
 * membre connecté (rapport QA du 7 oct. 2026, §3) : en-tête avec le badge de
 * l'offre (offres à prix fixe seulement, §6.2), onglets Profil, Entreprise,
 * Opportunités et Services. Sur son propre profil, le membre voit aussi sa
 * complétion, ses coordonnées et ses contenus non publiés.
 */
export default async function MemberProfilePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!user) notFound();

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const isSelf = viewer.id === user.id;
  const isCompanyAdmin = Boolean(user.company && user.company.companyAdminId === user.id);

  /**
   * Opportunités du membre et de son entreprise (une opportunité est
   * rattachée à son auteur, l'entreprise passe par lui). Les autres membres
   * ne voient que les opportunités publiées ; le membre lui-même voit aussi
   * les siennes en cours de validation ou refusées.
   */
  const authorScope: Prisma.OpportunityWhereInput = user.companyId
    ? { OR: [{ authorId: user.id }, { author: { companyId: user.companyId } }] }
    : { authorId: user.id };
  const opportunities = await prisma.opportunity.findMany({
    where: isSelf
      ? { AND: [authorScope, { OR: [{ status: "PUBLISHED" }, { authorId: user.id }] }] }
      : { AND: [authorScope, { status: "PUBLISHED" }] },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { author: { select: { name: true, title: true, avatarUrl: true, role: true } } },
  });

  // Mêmes règles que l'onglet Services de la fiche entreprise : le gérant
  // voit et gère toutes les fiches de l'entreprise, les autres seulement
  // les fiches publiées.
  const canManageServices = isSelf && isCompanyAdmin;
  const serviceScope: Prisma.ServiceListingWhereInput = user.companyId
    ? { OR: [{ companyId: user.companyId }, { authorId: user.id }] }
    : { authorId: user.id };
  const services = await prisma.serviceListing.findMany({
    where: canManageServices ? serviceScope : { AND: [serviceScope, { status: "PUBLISHED" }] },
    orderBy: { createdAt: "desc" },
  });

  // Audit sécurité (25 septembre 2026) — garde de rendu : des valeurs
  // antérieures à la validation http(s) stricte peuvent encore être en base
  // (ex. `javascript:...`) ; un lien au protocole non http(s) n'est pas affiché.
  const websiteHref = safeHref(user.websiteUrl);
  const linkedinHref = safeHref(user.linkedinUrl);
  const companyWebsiteHref = safeHref(user.company?.website);
  const offerBadge = offerBadgeLabel(user.company?.subscription);
  const completeness = isSelf ? profileCompleteness(user) : null;
  const unreadMessages = await countUnreadMessages(viewer.id);

  return (
    <AppShell
      user={{
        name: viewer.name,
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <div className="mb-4 overflow-hidden rounded-lg border border-border bg-white">
        <div className="h-24 bg-navy" />
        <div className="flex flex-wrap items-end justify-between gap-4 p-6 pt-0">
          <div className="flex min-w-0 items-end gap-4">
            <Avatar className="-mt-10 h-24 w-24 shrink-0 border-4 border-white">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
              <AvatarFallback className="text-lg">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-navy">{user.name}</h1>
                {offerBadge && <Badge variant="chairman">{offerBadge}</Badge>}
              </div>
              <p className="text-sm text-text-muted">
                {[user.title, user.company?.name, user.country].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1.5 text-xs text-text-muted">
                Membre depuis {formatDateFr(user.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pb-1">
            {isSelf ? (
              <Button asChild variant="outline">
                <Link href="/profil/editer">Éditer mon profil</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline">
                  <Link href={`/messagerie?new=${user.id}`}>Envoyer un message</Link>
                </Button>
                <Button disabled title="Disponible avec le Deal Room (bientôt)">
                  <Handshake className="h-4 w-4" />
                  Demander une connexion
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="profil">
        <TabsList>
          <TabsTrigger value="profil">Profil</TabsTrigger>
          <TabsTrigger value="entreprise">Entreprise</TabsTrigger>
          <TabsTrigger value="deal-room">Opportunités</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>

        <TabsContent value="profil">
          <div className="flex flex-col gap-4">
            {completeness !== null && completeness < 100 && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gold-light bg-gold-pale p-4">
                <div className="min-w-[180px] flex-1">
                  <p className="mb-1.5 text-sm font-semibold text-navy">
                    Profil complété à {completeness} %
                  </p>
                  <Progress value={completeness} />
                </div>
                <Button asChild size="sm">
                  <Link href="/profil/editer">Compléter maintenant</Link>
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-5 rounded-lg border border-border bg-white p-6">
              {user.bio ? (
                <p className="text-sm leading-relaxed text-text">{user.bio}</p>
              ) : (
                <p className="text-sm text-text-muted">Aucune bio renseignée.</p>
              )}

              {user.sectors.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-text-muted">
                    Secteurs d&apos;intérêt
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {user.sectors.map((sector) => (
                      <Badge key={sector} variant="secondary">
                        {sector}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2.5 text-sm">
                {/* Téléphone et e-mail : coordonnées internes, affichées au seul membre concerné. */}
                {isSelf && user.phone && (
                  <p className="inline-flex items-center gap-2 text-text-mid">
                    <Phone className="h-4 w-4 shrink-0" /> {user.phone}
                  </p>
                )}
                {isSelf && (
                  <p className="inline-flex min-w-0 items-center gap-2 text-text-mid">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>
                )}
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-medium text-navy-mid"
                  >
                    <Globe className="h-4 w-4 shrink-0" /> Site web
                  </a>
                )}
                {linkedinHref && (
                  <a
                    href={linkedinHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-medium text-navy-mid"
                  >
                    <Linkedin className="h-4 w-4 shrink-0" /> Profil LinkedIn
                  </a>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="entreprise">
          {user.company ? (
            <div className="rounded-lg border border-border bg-white p-6">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-navy">{user.company.name}</h2>
                {offerBadge && <Badge variant="chairman">{offerBadge}</Badge>}
              </div>
              <p className="text-sm text-text-muted">
                {[user.company.sector, user.company.country].filter(Boolean).join(" · ")}
              </p>
              {user.company.description && (
                <p className="mt-3 text-sm leading-relaxed text-text">{user.company.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-4">
                {companyWebsiteHref && (
                  <a
                    href={companyWebsiteHref}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm font-medium text-navy-mid"
                  >
                    {user.company.website}
                  </a>
                )}
                <Link
                  href={`/entreprises/${user.company.id}`}
                  className="text-sm font-semibold text-navy-mid"
                >
                  Voir la fiche entreprise →
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState icon={Building2} title="Aucune entreprise associée" />
          )}
        </TabsContent>

        <TabsContent value="deal-room">
          <div className="flex flex-col gap-3">
            {isSelf && (
              <div className="flex justify-end">
                <Button asChild size="sm">
                  <Link href="/deal-room/publier">
                    <Plus className="h-4 w-4" /> Publier une opportunité
                  </Link>
                </Button>
              </div>
            )}
            {opportunities.length === 0 ? (
              <EmptyState
                icon={Handshake}
                title="Aucune opportunité"
                description={
                  isSelf
                    ? "Vos opportunités et celles de votre entreprise s'afficheront ici."
                    : "Les opportunités de ce membre et de son entreprise s'afficheront ici."
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {opportunities.map((opp) => (
                  <div key={opp.id} className="flex min-w-0 flex-col gap-1.5">
                    {opp.status !== "PUBLISHED" && (
                      <Badge variant="pending" className="self-start">
                        {OPPORTUNITY_STATUS_LABEL[opp.status] ?? opp.status}
                      </Badge>
                    )}
                    <OpportunityCard
                      id={opp.id}
                      title={opp.title}
                      description={opp.description}
                      type={opp.type}
                      sector={opp.sector}
                      budget={opp.budget}
                      budgetEur={opp.budgetEur}
                      deadline={opp.deadline}
                      createdAt={opp.createdAt}
                      author={opp.author}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="services">
          <CompanyServicesManager services={services} isCompanyAdmin={canManageServices} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
