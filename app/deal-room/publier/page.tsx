import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { getReferentialLabels } from "@/lib/referentials-query";
import { AppShell } from "@/components/layout/app-shell";
import { PublishWizard } from "@/components/deal-room/publish-wizard";

export const metadata: Metadata = { title: "Publier une opportunité" };

export default async function PublishOpportunityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
  });
  if (!viewer) redirect("/login");

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
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <PublishWizard
        authorName={viewer.name}
        authorTitle={viewer.title ?? ""}
        types={types}
        sectors={sectors}
        countries={countries}
      />
    </AppShell>
  );
}
