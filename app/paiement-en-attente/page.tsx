import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActivePlans } from "@/lib/plans-query";
import { getOnboardingStatus, getIndividualOnboardingStatus } from "@/lib/onboarding-status";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { OnboardingStatusList } from "@/components/entreprise/onboarding-status-list";
import { IndividualPlanPicker } from "@/components/adhesion/individual-plan-picker";
import { StartIndividualPlanButton } from "@/components/adhesion/start-individual-plan-button";
import { Button } from "@/components/ui/button";
import { formatAriary } from "@/lib/utils";

export const metadata: Metadata = { title: "Accès en attente" };

/**
 * B1f (audit du 29 juillet 2026) — avant ce correctif, un candidat approuvé
 * qui n'allait jamais au bout du paiement Evolia obtenait un accès complet
 * et gratuit. middleware.ts redirige ici tout compte ACTIVE sans tier
 * personnel ni entreprise à l'abonnement actif.
 *
 * Parcours revu (1er août 2026) — statut de dossier affiché pour que
 * l'utilisateur sache où il en est sans solliciter l'équipe.
 *
 * Phase 2ter (1er août 2026) — Evolia écarté aussi pour les adhésions
 * individuelles : trois cas possibles ici, mutuellement exclusifs.
 * (1) une entreprise existe déjà → chemin entreprise inchangé ; (2) une
 * adhésion individuelle est déjà en cours → son propre statut de dossier
 * (5 étapes, pas 9) ; (3) rien n'existe encore → soit l'offre choisie sur
 * le site public est déjà connue (`User.intendedPlanId`) et proposée
 * directement, soit une fourche individuel/entreprise est affichée.
 */
export default async function PaymentPendingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      company: {
        include: { subscription: true, invites: { select: { id: true }, take: 1 } },
      },
      memberships: {
        where: { status: { in: ["PENDING_PAYMENT", "PENDING_REVIEW", "ACTIVE"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
      intendedPlan: true,
    },
  });
  const hasCompany = Boolean(viewer?.companyId);
  const membership = viewer?.memberships[0];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-card-md">
        <h1 className="mb-3 text-xl font-bold text-navy">Accès en attente</h1>

        {hasCompany ? (
          <CompanyPath viewer={viewer!} />
        ) : membership ? (
          <IndividualInProgressPath membership={membership} />
        ) : viewer?.intendedPlan ? (
          <IntendedPlanPath plan={viewer.intendedPlan} />
        ) : (
          <ForkPath />
        )}

        <p className="mb-6 mt-6 text-xs text-text-muted">
          Une question ? Contactez l&apos;équipe CEO Summit.
        </p>
        <SignOutButton className="mx-auto flex items-center justify-center gap-2 text-sm font-semibold text-navy-mid" />
      </div>
    </div>
  );
}

interface CompanyPathViewer {
  company: {
    subscription: { status: string } | null;
    invites: { id: string }[];
  } | null;
}

function CompanyPath({ viewer }: { viewer: CompanyPathViewer }) {
  const statusItems = getOnboardingStatus({
    hasCompany: true,
    hasInvites: (viewer.company?.invites.length ?? 0) > 0,
    subscriptionStatus: viewer.company?.subscription?.status as never,
  });

  return (
    <>
      <p className="mb-6 text-sm leading-relaxed text-text-mid">
        Votre entreprise n&apos;a pas encore d&apos;abonnement actif — l&apos;accès complet à la
        plateforme s&apos;active automatiquement dès la confirmation du paiement.
      </p>
      <div className="mb-6 text-left">
        <OnboardingStatusList items={statusItems} />
      </div>
      {viewer.company?.subscription?.status === "PENDING_PAYMENT" && (
        <Button asChild className="mb-4 w-full justify-center">
          <Link href="/entreprise/paiement">Soumettre le paiement</Link>
        </Button>
      )}
    </>
  );
}

function IndividualInProgressPath({
  membership,
}: {
  membership: { status: string; plan: { name: string; priceAr: number } | null };
}) {
  const statusItems = getIndividualOnboardingStatus(membership.status as never);

  return (
    <>
      <p className="mb-6 text-sm leading-relaxed text-text-mid">
        Votre compte est confirmé — il ne reste que le paiement de votre adhésion
        {membership.plan && (
          <>
            {" "}
            (<strong>{membership.plan.name}</strong> — {formatAriary(membership.plan.priceAr)}
            /an)
          </>
        )}
        .
      </p>
      <div className="mb-6 text-left">
        <OnboardingStatusList items={statusItems} />
      </div>
      {membership.status === "PENDING_PAYMENT" && (
        <Button asChild className="mb-4 w-full justify-center">
          <Link href="/adhesion/paiement">Soumettre le paiement</Link>
        </Button>
      )}
    </>
  );
}

function IntendedPlanPath({ plan }: { plan: { id: string; name: string; priceAr: number } }) {
  return (
    <>
      <p className="mb-6 text-sm leading-relaxed text-text-mid">
        Vous vous êtes inscrit pour <strong>{plan.name}</strong> ({formatAriary(plan.priceAr)}/an) —
        confirmez pour passer au paiement.
      </p>
      <div className="mb-4">
        <StartIndividualPlanButton planId={plan.id} />
      </div>
    </>
  );
}

async function ForkPath() {
  const individualPlans = await getActivePlans("INDIVIDUAL", { selfServiceOnly: true });

  return (
    <>
      <p className="mb-6 text-sm leading-relaxed text-text-mid">
        Votre compte est confirmé, mais aucune entreprise ni adhésion active n&apos;y est encore
        rattachée. Rejoignez CEO Summit en votre nom propre, ou créez la fiche de votre entreprise.
      </p>

      <div className="mb-6 text-left">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">
          À titre individuel
        </p>
        <IndividualPlanPicker plans={individualPlans} />
      </div>

      <div className="mb-4 flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button asChild variant="outline" className="mb-4 w-full justify-center">
        <Link href="/entreprise/creer">Créer mon entreprise</Link>
      </Button>
    </>
  );
}
