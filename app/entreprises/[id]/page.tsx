import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Briefcase, Globe, Handshake } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberCard } from "@/components/catalogue/member-card";
import { InviteTeammateForm } from "@/components/entreprise/invite-teammate-form";
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
export default async function CompanyProfilePage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
  });
  if (!viewer) redirect("/login");

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: {
      users: {
        where: { status: "ACTIVE" },
        select: { id: true, name: true, title: true, avatarUrl: true, country: true, role: true },
      },
      subscription: { include: { plan: true } },
      invites: { where: { status: "PENDING" }, select: { id: true, name: true, email: true } },
    },
  });
  if (!company) notFound();

  const isCompanyAdmin = company.companyAdminId === viewer.id;
  const unreadMessages = await countUnreadMessages(viewer.id);

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(viewer.memberships[0]?.tier),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.role === "ADMIN",
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

      <Tabs defaultValue="apercu">
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
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-navy">Abonnement</h2>
                  <Badge
                    variant={SUBSCRIPTION_STATUS_BADGE[company.subscription?.status ?? "DRAFT"]}
                  >
                    {SUBSCRIPTION_STATUS_LABEL[company.subscription?.status ?? "DRAFT"]}
                  </Badge>
                </div>
                {company.subscription ? (
                  <p className="text-sm text-text-mid">
                    {company.subscription.plan.name} —{" "}
                    {formatAriary(company.subscription.plan.priceAr)}
                    /an
                  </p>
                ) : (
                  <p className="text-sm text-text-muted">
                    Aucune offre choisie pour l&apos;instant.
                  </p>
                )}
                <div className="mt-3">
                  {!company.subscription && (
                    <Button asChild size="sm">
                      <Link href="/entreprise/abonnement">Choisir une offre</Link>
                    </Button>
                  )}
                  {company.subscription?.status === "PENDING_PAYMENT" && (
                    <Button asChild size="sm">
                      <Link href="/entreprise/paiement">Soumettre le paiement</Link>
                    </Button>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-white p-5">
                <h2 className="mb-3 text-sm font-bold text-navy">Inviter des collaborateurs</h2>
                <InviteTeammateForm companyId={company.id} pendingInvites={company.invites} />
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </AppShell>
  );
}
