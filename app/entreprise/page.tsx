import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import { VIEWER_TIER_INCLUDE } from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Mon entreprise" };

/**
 * "Mon Entreprise" resolves to the viewer's own /entreprises/[id] when
 * already linked. Phase 2 offres/paiement (30 juillet 2026) — désormais un
 * vrai point d'entrée vers /entreprise/creer, plus un cul-de-sac
 * "fonctionnalité pas encore disponible".
 */
export default async function MyCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: VIEWER_TIER_INCLUDE,
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
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.isPlatformAdmin,
      }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <EmptyState
        icon={Building2}
        title="Aucune entreprise associée à votre compte"
        description="Créez la fiche de votre entreprise pour inviter vos collaborateurs et choisir une offre."
        action={
          <Button asChild>
            <Link href="/entreprise/creer">Créer mon entreprise</Link>
          </Button>
        }
      />
    </AppShell>
  );
}
