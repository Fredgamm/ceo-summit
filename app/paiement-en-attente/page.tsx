import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOnboardingStatus } from "@/lib/onboarding-status";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { OnboardingStatusList } from "@/components/entreprise/onboarding-status-list";
import { AccessGrantedRefresh } from "@/components/entreprise/access-granted-refresh";
import { Button } from "@/components/ui/button";
import { formatAriary } from "@/lib/utils";

export const metadata: Metadata = { title: "Accès en attente" };

/**
 * B1f (audit du 29 juillet 2026) — avant ce correctif, un candidat approuvé
 * qui n'allait jamais au bout du paiement Evolia obtenait un accès complet
 * et gratuit. middleware.ts redirige ici tout compte ACTIVE sans entreprise
 * à l'abonnement actif/expiré.
 *
 * 4 août 2026 (CEO Summit devenu intégralement B2B) — plus de fourche
 * individuel/entreprise : chaque compte doit être rattaché à une entreprise.
 * Deux cas possibles, mutuellement exclusifs : (1) une entreprise existe
 * déjà → statut de dossier + lien vers le paiement ; (2) rien n'existe
 * encore → l'offre choisie sur le site public est déjà connue
 * (`User.intendedPlanId`) et rappelée, ou un simple lien vers la création
 * d'entreprise est proposé.
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
      intendedPlan: true,
    },
  });
  const hasCompany = Boolean(viewer?.companyId);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-card-md">
        <h1 className="mb-3 text-xl font-bold text-navy">Accès en attente</h1>

        {hasCompany ? (
          <CompanyPath viewer={viewer!} />
        ) : viewer?.intendedPlan ? (
          <IntendedPlanPath plan={viewer.intendedPlan} />
        ) : (
          <NoCompanyPath />
        )}

        <div className="mb-6 mt-6 border-t border-border pt-4 text-xs text-text-muted">
          <p className="mb-2">Une question ? Contactez l&apos;équipe CEO SUMMIT INDIAN OCEAN.</p>
          <div className="flex flex-col gap-1">
            <p>
              <a href="tel:+261380913114" className="text-navy-mid hover:underline">
                038 09 131 14
              </a>{" "}
              –{" "}
              <a href="mailto:register@ceo-summit.mg" className="text-navy-mid hover:underline">
                register@ceo-summit.mg
              </a>{" "}
              (inscriptions)
            </p>
            <p>
              <a href="tel:+261380113114" className="text-navy-mid hover:underline">
                038 01 131 14
              </a>{" "}
              –{" "}
              <a href="mailto:team@ceo-summit.mg" className="text-navy-mid hover:underline">
                team@ceo-summit.mg
              </a>{" "}
              (plateforme)
            </p>
          </div>
        </div>
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

/** Statuts qui donnent déjà accès à la plateforme (RG-12) — si on atterrit
 * quand même ici avec l'un de ces statuts, ce n'est pas l'entreprise qui
 * bloque : c'est la session (JWT) de ce navigateur qui date d'avant la
 * validation : AccessGrantedRefresh la met à jour sans reconnexion. */
const ALREADY_GRANTED_STATUSES = ["ACTIVE", "EXPIRED"];

function CompanyPath({ viewer }: { viewer: CompanyPathViewer }) {
  const subscriptionStatus = viewer.company?.subscription?.status;
  const statusItems = getOnboardingStatus({
    hasCompany: true,
    hasInvites: (viewer.company?.invites.length ?? 0) > 0,
    subscriptionStatus: subscriptionStatus as never,
  });

  if (subscriptionStatus && ALREADY_GRANTED_STATUSES.includes(subscriptionStatus)) {
    return (
      <div className="mb-2">
        <AccessGrantedRefresh />
      </div>
    );
  }

  return (
    <>
      <p className="mb-6 text-sm leading-relaxed text-text-mid">
        Votre entreprise n&apos;a pas encore d&apos;abonnement actif — l&apos;accès complet à la
        plateforme s&apos;active automatiquement dès la confirmation du paiement.
      </p>
      <div className="mb-6 text-left">
        <OnboardingStatusList items={statusItems} />
      </div>
      {subscriptionStatus === "PENDING_PAYMENT" && (
        <Button asChild className="mb-4 w-full justify-center">
          <Link href="/entreprise/paiement">Soumettre le paiement</Link>
        </Button>
      )}
    </>
  );
}

function IntendedPlanPath({
  plan,
}: {
  plan: { slug: string; name: string; priceAr: number; pricingMode: string | null };
}) {
  return (
    <>
      <p className="mb-6 text-sm leading-relaxed text-text-mid">
        Vous vous êtes inscrit pour <strong>{plan.name}</strong> (
        {plan.pricingMode === "PER_PARTICIPANT"
          ? `${formatAriary(plan.priceAr)} par participant`
          : formatAriary(plan.priceAr)}
        ) — créez la fiche de votre entreprise pour continuer.
      </p>
      <Button asChild className="mb-4 w-full justify-center">
        <Link href={`/entreprise/creer?offre=${plan.slug}`}>Créer mon entreprise</Link>
      </Button>
    </>
  );
}

function NoCompanyPath() {
  return (
    <>
      <p className="mb-6 text-sm leading-relaxed text-text-mid">
        Votre compte est confirmé, mais aucune entreprise n&apos;y est encore rattachée. Créez la
        fiche de votre entreprise pour accéder à la plateforme.
      </p>
      <Button asChild className="mb-4 w-full justify-center">
        <Link href="/entreprise/creer">Créer mon entreprise</Link>
      </Button>
    </>
  );
}
