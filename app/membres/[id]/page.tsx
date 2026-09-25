import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, Globe, Handshake, Briefcase, Linkedin } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { safeHref } from "@/lib/normalize-url";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateFr, initials, tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Profil membre" };

const TIER_BADGE: Record<string, "member" | "executive" | "chairman"> = {
  MEMBER: "member",
  EXECUTIVE: "executive",
  CHAIRMAN: "chairman",
};

/**
 * E2-T01 — page profil membre. Deal Room and Services tabs are placeholders
 * (EmptyState) — those epics (E5/E6) don't exist yet. "Demander une
 * connexion" is disabled for the same reason: it's explicitly a Deal Room
 * action in the backlog, and there's no Deal Room to connect through yet.
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
  // Audit sécurité (25 septembre 2026) — garde de rendu : des valeurs
  // antérieures à la validation http(s) stricte peuvent encore être en base
  // (ex. `javascript:...`) ; un lien au protocole non http(s) n'est pas affiché.
  const websiteHref = safeHref(user.websiteUrl);
  const linkedinHref = safeHref(user.linkedinUrl);
  const companyWebsiteHref = safeHref(user.company?.website);
  const tier = getViewerTierFromCompany(user.company);
  const unreadMessages = await countUnreadMessages(viewer.id);

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
      <div className="mb-4 overflow-hidden rounded-lg border border-border bg-white">
        <div className="h-24 bg-navy" />
        <div className="flex flex-wrap items-end justify-between gap-4 p-6 pt-0">
          <div className="flex items-end gap-4">
            <Avatar className="-mt-10 h-24 w-24 shrink-0 border-4 border-white">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
              <AvatarFallback className="text-lg">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="pb-1">
              <h1 className="text-xl font-bold text-navy">{user.name}</h1>
              <p className="text-sm text-text-muted">
                {[user.title, user.company?.name, user.country].filter(Boolean).join(" · ")}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                {tier && <Badge variant={TIER_BADGE[tier]}>{tierLabel(tier)}</Badge>}
                <span className="text-xs text-text-muted">
                  Membre depuis {formatDateFr(user.createdAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pb-1">
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

            {(websiteHref || linkedinHref) && (
              <div className="flex flex-wrap gap-4">
                {websiteHref && (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-mid"
                  >
                    <Globe className="h-4 w-4" /> Site web
                  </a>
                )}
                {linkedinHref && (
                  <a
                    href={linkedinHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-mid"
                  >
                    <Linkedin className="h-4 w-4" /> Profil LinkedIn
                  </a>
                )}
              </div>
            )}

            {/* Phone is internal-use only per wireframe/profil.html — never shown on someone else's profile. */}
            {isSelf && user.phone && (
              <p className="text-sm text-text-muted">Téléphone (usage interne) : {user.phone}</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="entreprise">
          {user.company ? (
            <div className="rounded-lg border border-border bg-white p-6">
              <h2 className="text-base font-bold text-navy">{user.company.name}</h2>
              <p className="text-sm text-text-muted">
                {[user.company.sector, user.company.country].filter(Boolean).join(" · ")}
              </p>
              {user.company.description && (
                <p className="mt-3 text-sm leading-relaxed text-text">{user.company.description}</p>
              )}
              {companyWebsiteHref && (
                <a
                  href={companyWebsiteHref}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-navy-mid"
                >
                  {user.company.website}
                </a>
              )}
            </div>
          ) : (
            <EmptyState icon={Building2} title="Aucune entreprise associée" />
          )}
        </TabsContent>

        <TabsContent value="deal-room">
          <EmptyState
            icon={Handshake}
            title="Bientôt disponible"
            description="Les opportunités Deal Room de ce membre s'afficheront ici."
          />
        </TabsContent>

        <TabsContent value="services">
          <EmptyState
            icon={Briefcase}
            title="Bientôt disponible"
            description="Les services proposés par ce membre s'afficheront ici."
          />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
