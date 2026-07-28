import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { PublishWizard } from "@/components/deal-room/publish-wizard";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Publier une opportunité" };

export default async function PublishOpportunityPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { memberships: { where: { status: "ACTIVE" }, take: 1 } },
  });
  if (!viewer) redirect("/login");

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(viewer.memberships[0]?.tier),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.role === "ADMIN",
      }}
    >
      <PublishWizard authorName={viewer.name} authorTitle={viewer.title ?? ""} />
    </AppShell>
  );
}
