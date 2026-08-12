import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import {
  getViewerRankFromCompany,
  getViewerTierFromCompany,
  LEGACY_TIER_RANK,
  VIEWER_TIER_INCLUDE,
} from "@/lib/plan-access";
import { AppShell } from "@/components/layout/app-shell";
import { BuyCreditsForm } from "@/components/credits/buy-credits-form";
import { EmptyState } from "@/components/ui/empty-state";
import { tierLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Acheter des crédits" };

export default async function BuyCreditsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [viewer, packs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      include: { creditBalance: true, ...VIEWER_TIER_INCLUDE },
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

  const unreadMessages = await countUnreadMessages(viewer.id);

  // Sprint de correction (5 août 2026, EX-T01) — même gate que côté action
  // (requestCreditPurchase) : évite d'afficher un formulaire d'achat que la
  // soumission rejetterait de toute façon.
  const isEligible = getViewerRankFromCompany(viewer.company) >= LEGACY_TIER_RANK.EXECUTIVE;

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
      <div className="mb-6 rounded-lg bg-navy p-6 text-white">
        <p className="text-sm text-white/60">Crédits actuels</p>
        <p className="text-4xl font-black">{available === null ? "Illimité" : available}</p>
      </div>

      <h1 className="mb-1 text-lg font-bold text-navy">Packs de crédits additionnels</h1>
      <p className="mb-5 text-sm text-text-mid">
        Chaque crédit permet de contacter le porteur d&apos;une opportunité Deal Room.
      </p>

      {isEligible ? (
        <BuyCreditsForm packs={packs} />
      ) : (
        <EmptyState
          title="Réservé aux membres Executive et Chairman"
          description="Passez à une offre entreprise de rang Executive ou supérieur pour acheter des crédits Deal Room."
        />
      )}
    </AppShell>
  );
}
