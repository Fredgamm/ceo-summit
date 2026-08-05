import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { getViewerTierFromCompany, VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getReferentialLabels } from "@/lib/referentials-query";
import { AppShell } from "@/components/layout/app-shell";
import { PublishWizard } from "@/components/deal-room/publish-wizard";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Modifier une opportunité" };

/**
 * Sprint de correction (5 août 2026, EX-T01) — réédition d'une opportunité
 * REFUSED/CHANGES_REQUESTED (voir app/actions/deal-room.ts::resubmitOpportunity).
 * Réservé à l'auteur, et seulement dans ces deux statuts — une opportunité
 * publiée/en attente/dépubliée ne passe pas par ce formulaire.
 */
export default async function EditOpportunityPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

  const opportunity = await prisma.opportunity.findUnique({ where: { id: params.id } });
  if (!opportunity || opportunity.authorId !== viewer.id) notFound();
  if (opportunity.status !== "REFUSED" && opportunity.status !== "CHANGES_REQUESTED") {
    redirect(`/deal-room/${opportunity.id}`);
  }

  const [unreadMessages, types, sectors, countries] = await Promise.all([
    countUnreadMessages(viewer.id),
    getReferentialLabels("opportunity_type"),
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
  ]);

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(getViewerTierFromCompany(viewer.company)),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.role === "ADMIN",
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <PublishWizard
        authorName={viewer.name}
        authorTitle={viewer.title ?? ""}
        types={types}
        sectors={sectors}
        countries={countries}
        editOpportunityId={opportunity.id}
        initialValues={{
          type: opportunity.type,
          sector: opportunity.sector,
          country: opportunity.country,
          title: opportunity.title,
          description: opportunity.description,
          budget: opportunity.budget != null ? String(opportunity.budget) : "",
          deadline: opportunity.deadline ? opportunity.deadline.toISOString().slice(0, 10) : "",
          visibility: opportunity.visibility,
          attachments: opportunity.attachments.map((key) => ({
            key,
            name: key.split("/").pop() ?? key,
          })),
        }}
      />
    </AppShell>
  );
}
