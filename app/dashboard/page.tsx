import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Accueil" };

/**
 * First protected page wired end-to-end: middleware → session → Prisma → AppShell.
 * Full dashboard content (banner, stats, activity feed — wireframe dashboard.html)
 * is tracked separately; this proves the auth + layout foundation works.
 */
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
  });
  if (!user) redirect("/login");

  const tierLabel = user.memberships[0]?.tier
    ? user.memberships[0].tier.charAt(0) + user.memberships[0].tier.slice(1).toLowerCase()
    : "Membre";

  return (
    <AppShell
      user={{
        name: user.name,
        tier: tierLabel,
        avatarUrl: user.avatarUrl,
        isAdmin: user.role === "ADMIN",
      }}
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Bonjour, {user.name.split(" ")[0]} 👋</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fondations posées</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-text-mid">
          Auth, RBAC, layout et composants UI sont opérationnels. Le contenu complet du
          tableau de bord (bannière événement, stats, activité récente) suit dans E2/E3.
        </CardContent>
      </Card>
    </AppShell>
  );
}
