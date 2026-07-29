import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Mon entreprise" };

/**
 * "Mon Entreprise" in the sidebar needs a destination. There's no
 * create/edit-company task in the current backlog (E2-T05 is a view page
 * only), so this just resolves to the viewer's own /entreprises/[id] when
 * linked, or explains there's none yet — no fake "add company" flow.
 */
export default async function MyCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
  });
  if (!viewer) redirect("/login");

  if (viewer.companyId) {
    redirect(`/entreprises/${viewer.companyId}`);
  }

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
      <EmptyState
        icon={Building2}
        title="Aucune entreprise associée à votre compte"
        description="Cette fonctionnalité n'est pas encore disponible depuis la plateforme — contactez l'équipe CEO Summit pour associer votre entreprise."
      />
    </AppShell>
  );
}
