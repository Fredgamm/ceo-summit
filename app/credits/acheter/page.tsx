import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/app-shell";
import { BuyCreditsForm } from "@/components/credits/buy-credits-form";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Acheter des crédits" };

export default async function BuyCreditsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [viewer, packs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: { memberships: { where: { status: "ACTIVE" }, take: 1 }, creditBalance: true },
    }),
    prisma.creditPackPrice.findMany({ orderBy: { credits: "asc" } }),
  ]);
  if (!viewer) redirect("/login");

  const available =
    viewer.role === "CHAIRMAN"
      ? null
      : viewer.creditBalance
        ? viewer.creditBalance.included + viewer.creditBalance.purchased - viewer.creditBalance.used
        : 0;

  return (
    <AppShell
      user={{
        name: viewer.name,
        tier: tierLabel(viewer.memberships[0]?.tier),
        avatarUrl: viewer.avatarUrl,
        isAdmin: viewer.role === "ADMIN",
      }}
    >
      <div className="mb-6 rounded-lg bg-navy p-6 text-white">
        <p className="text-sm text-white/60">Crédits actuels</p>
        <p className="text-4xl font-black">{available === null ? "Illimité" : available}</p>
      </div>

      <h1 className="mb-1 text-lg font-bold text-navy">Packs de crédits additionnels</h1>
      <p className="mb-5 text-sm text-text-mid">
        Chaque crédit permet de contacter le porteur d&apos;une opportunité Deal Room.
      </p>

      <BuyCreditsForm packs={packs} />
    </AppShell>
  );
}
