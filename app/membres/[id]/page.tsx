import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import {
  Building2,
  CalendarClock,
  CalendarPlus,
  Globe,
  Handshake,
  Linkedin,
  Mail,
  Phone,
  Send,
} from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { safeHref } from "@/lib/normalize-url";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { offerBadgeLabel } from "@/lib/offer-badge";
import { profileCompleteness } from "@/lib/profile-completeness";
import {
  loadMemberMeetingView,
  loadMyMeetingEvents,
  loadMyMeetings,
  missingMeetingProfileFields,
} from "@/lib/meeting-participation";
import {
  formatDayKey,
  formatTimeInZone,
  formatTimeRangeInZone,
  timezoneLabel,
  zonedDayKey,
} from "@/lib/event-timezone";
import { MyMeetingSlots, type MyMeetingEventView } from "@/components/meetings/my-meeting-slots";
import { MyMeetings, type MyMeetingView } from "@/components/meetings/my-meetings";
import { meetingCta } from "@/lib/meeting-request-ui";
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
import { AddButton } from "@/components/ui/add-button";

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
 *
 * Module 21 lot 3 (8 oct. 2026) — onglet « Mes créneaux » sur son propre
 * profil, toujours visible (vide tant qu'aucun événement auquel il participe
 * n'a de créneaux publiés). `?onglet=creneaux` l'ouvre directement (lien des
 * emails).
 *
 * Module 21 lots 5 et 8 (3 nov. 2026) — onglet « Mes rendez-vous », lui aussi
 * toujours visible sur son propre profil, avec le nombre de demandes reçues
 * en attente de réponse. `?onglet=mes-rendez-vous` l'ouvre directement.
 */
export default async function MemberProfilePage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ onglet?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
  const meetingEvents: MyMeetingEventView[] = isSelf
    ? (await loadMyMeetingEvents(user.id)).map((event) => ({
        id: event.id,
        title: event.title,
        timezoneLabel: timezoneLabel(event.timezone),
        zone: event.zone,
        accessInstructions: event.accessInstructions,
        counts: event.counts,
        days: event.days.map((d) => ({
          label: formatDayKey(d.day),
          slots: d.slots.map((s) => ({
            id: s.id,
            range: formatTimeRangeInZone(s.startTime, s.endTime, event.timezone),
            status: s.status,
            started: s.started,
          })),
        })),
      }))
    : [];
  const myMeetings: MyMeetingView[] = isSelf
    ? (await loadMyMeetings(user.id)).map((m) => {
        const tz = m.event.timezone;
        return {
          id: m.id,
          sent: m.sent,
          status: m.status,
          reason: m.reason,
          responseMessage: m.responseMessage,
          when: `${formatDayKey(zonedDayKey(m.startTime, tz))}, ${formatTimeRangeInZone(m.startTime, m.endTime, tz)}`,
          timezoneLabel: timezoneLabel(tz),
          expiresLabel: `${formatDayKey(zonedDayKey(m.expiresAt, tz))} à ${formatTimeInZone(m.expiresAt, tz)}`,
          eventTitle: m.event.title,
          zone: m.event.zone,
          accessInstructions: m.event.accessInstructions,
          partner: m.partner,
          googleCalendarUrl: m.googleCalendarUrl,
        };
      })
    : [];
  const pendingReceived = myMeetings.filter((m) => !m.sent && m.status === "PENDING").length;
  // Toujours visible sur son propre profil, même vide (demande du client).
  const showMySlots = isSelf;
  // Module 21 lot 4 — « Rendez-vous événement » : profil d'un autre
  // participant du même Summit (les deux inscrits par une offre).
  const memberMeeting = isSelf ? null : await loadMemberMeetingView(viewer.id, user.id);
  const tabs = [
    "profil",
    "entreprise",
    "deal-room",
    "services",
    ...(showMySlots ? ["creneaux", "mes-rendez-vous"] : []),
  ];
  const defaultTab =
    searchParams?.onglet && tabs.includes(searchParams.onglet) ? searchParams.onglet : "profil";
  // L'onglet « Rendez-vous événement » est remplacé par une page dédiée (3 nov. 2026) :
  // les anciens liens `?onglet=rendez-vous` y mènent.
  if (searchParams?.onglet === "rendez-vous" && memberMeeting) {
    redirect(`/membres/${user.id}/rendez-vous`);
  }
  // Bouton d'en-tête « Demander un rendez-vous » (états : demander, voir, compléter, grisé).
  const meetingAction = memberMeeting
    ? meetingCta({
        existingBooking: memberMeeting.existingBooking,
        viewerMissingFields: missingMeetingProfileFields(viewer),
        memberUnavailable: memberMeeting.memberUnavailable,
        hasFreeSlot: memberMeeting.days.some((d) => d.slots.some((sl) => sl.state === "available")),
      })
    : null;
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
      {/* Mobile (21 oct. 2026) : photo à cheval sur la bannière, nom en dessous et
          boutons sur toute la largeur — côte à côte, le nom n'avait plus la place
          et la photo décrochait de la bannière. */}
      <div className="mb-4 overflow-hidden rounded-lg border border-border bg-white">
        <div className="h-16 bg-navy sm:h-24" />
        <div className="flex flex-col gap-4 p-4 pt-0 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:p-6 sm:pt-0">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <Avatar className="-mt-10 h-20 w-20 shrink-0 border-4 border-white sm:h-24 sm:w-24">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
              <AvatarFallback className="text-lg">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 sm:pb-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <h1 className="text-lg font-bold leading-tight text-navy sm:text-xl">
                  {user.name}
                </h1>
                {offerBadge && <Badge variant="chairman">{offerBadge}</Badge>}
              </div>
              <p className="mt-1 text-sm text-text-muted">
                {[user.title, user.company?.name, user.country].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1.5 text-xs text-text-muted">
                Membre depuis {formatDateFr(user.createdAt)}
              </p>
            </div>
          </div>

          {/* 3 nov. 2026 — les deux boutons côte à côte (mobile : moitié de la largeur
              chacun), jamais empilés. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:pb-1">
            {isSelf ? (
              <>
                <Button asChild variant="outline" className="col-span-2 sm:col-auto">
                  <Link href="/profil/editer">Éditer mon profil</Link>
                </Button>
                {/* 3 nov. 2026 — la déconnexion mobile est dans le menu « Profil » de la barre du haut. */}
              </>
            ) : (
              <>
                {meetingAction && (
                  <div className="col-span-2 sm:col-auto">
                    {meetingAction.kind === "disabled" ? (
                      <Button disabled title={meetingAction.reason} className="w-full">
                        <CalendarPlus className="h-4 w-4" aria-hidden />
                        {meetingAction.label}
                      </Button>
                    ) : (
                      <Button asChild className="w-full">
                        <Link
                          href={
                            meetingAction.kind === "request"
                              ? `/membres/${user.id}/rendez-vous`
                              : meetingAction.kind === "view"
                                ? "/profil?onglet=mes-rendez-vous"
                                : "/profil/editer"
                          }
                        >
                          <CalendarPlus className="h-4 w-4" aria-hidden />
                          {meetingAction.label}
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
                <Button asChild variant="outline">
                  <Link href={`/messagerie?new=${user.id}`}>
                    <Send className="h-4 w-4" aria-hidden />
                    Message
                  </Link>
                </Button>
                <Button disabled title="Disponible avec le Deal Room (bientôt)">
                  <Handshake className="h-4 w-4" aria-hidden />
                  Se connecter
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue={defaultTab}>
        {/* Mobile : les onglets passent à la ligne et se partagent la largeur (components/ui/tabs.tsx). */}
        <TabsList>
          <TabsTrigger value="profil">Profil</TabsTrigger>
          <TabsTrigger value="entreprise">Entreprise</TabsTrigger>
          <TabsTrigger value="deal-room">Opportunités</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          {showMySlots && <TabsTrigger value="creneaux">Mes créneaux</TabsTrigger>}
          {showMySlots && (
            <TabsTrigger value="mes-rendez-vous">
              Mes rendez-vous
              {pendingReceived > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
                  {pendingReceived}
                </span>
              )}
            </TabsTrigger>
          )}
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
                <AddButton href="/deal-room/publier">Publier une opportunité</AddButton>
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

        {showMySlots && (
          <TabsContent value="creneaux">
            {meetingEvents.length > 0 ? (
              <MyMeetingSlots
                events={meetingEvents}
                missingProfileFields={missingMeetingProfileFields(user)}
              />
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="Aucun créneau de rendez-vous pour le moment"
                description="Les créneaux apparaissent ici quand l'organisation les publie pour un événement auquel vous participez. Ils seront actifs par défaut : vous désactiverez ceux où vous n'êtes pas disponible."
              />
            )}
          </TabsContent>
        )}

        {showMySlots && (
          <TabsContent value="mes-rendez-vous">
            {myMeetings.length > 0 ? (
              <MyMeetings meetings={myMeetings} />
            ) : (
              <EmptyState
                icon={Handshake}
                title="Aucun rendez-vous pour le moment"
                description="Les demandes de rendez-vous que vous envoyez ou recevez pendant l'événement s'affichent ici. Pour en demander un, ouvrez le profil d'un participant, onglet « Rendez-vous événement »."
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </AppShell>
  );
}
