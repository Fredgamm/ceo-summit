import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cleanPlanName } from "@/lib/plans-query";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { AccessGrantedRefresh } from "@/components/entreprise/access-granted-refresh";
import { JourneyShell } from "@/components/onboarding/journey-shell";
import { MembershipCard, type MembershipCardStatus } from "@/components/onboarding/membership-card";
import { Button } from "@/components/ui/button";
import { AriaryHint } from "@/components/ui/ariary-hint";
import { cn, formatEuro, planPriceEur } from "@/lib/utils";
import { getEurToArRate } from "@/lib/currency-conversion";

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
      company: { include: { subscription: { include: { plan: true } } } },
      intendedPlan: true,
    },
  });
  const eurToArRate = await getEurToArRate();
  const company = viewer?.company ?? null;
  const subscription = company?.subscription ?? null;
  const status = subscription?.status;
  const plan = subscription?.plan ?? viewer?.intendedPlan ?? null;

  const signOut = (
    <SignOutButton className="flex items-center gap-1.5 text-sm font-semibold text-navy-mid hover:text-navy" />
  );
  const cardStatus: MembershipCardStatus =
    status === "PENDING_REVIEW"
      ? "review"
      : status === "ACTIVE" || status === "EXPIRED"
        ? "active"
        : status === "PENDING_PAYMENT"
          ? "payment"
          : "draft";
  const card = (
    <MembershipCard
      planName={plan ? cleanPlanName(plan.name) : null}
      priceEur={plan ? planPriceEur(plan, eurToArRate) : null}
      priceAr={
        plan
          ? plan.priceEur != null
            ? Math.round(plan.priceEur * eurToArRate)
            : plan.priceAr
          : null
      }
      priceSuffix={plan?.pricingMode === "PER_PARTICIPANT" ? " / participant" : undefined}
      companyName={company?.name ?? null}
      status={cardStatus}
    />
  );

  // Statuts qui donnent déjà accès (RG-12) : c'est alors la session de ce
  // navigateur qui date d'avant la validation — AccessGrantedRefresh la met
  // à jour sans reconnexion.
  if (status === "ACTIVE" || status === "EXPIRED") {
    return (
      <JourneyShell
        current="activation"
        title="Votre accès est prêt"
        card={card}
        headerAction={signOut}
      >
        <AccessGrantedRefresh />
      </JourneyShell>
    );
  }

  if (company && status === "PENDING_REVIEW") {
    return (
      <JourneyShell
        current="activation"
        title="Paiement en vérification"
        subtitle="L'accès complet à la plateforme s'active automatiquement dès que le paiement est confirmé. Vous recevrez un e-mail."
        card={card}
        headerAction={signOut}
      >
        <StatusTimeline
          items={[
            { label: "Compte et entreprise créés", state: "done" },
            { label: "Paiement envoyé", state: "done" },
            { label: "Vérification du paiement", state: "current" },
            { label: "Accès ouvert à votre équipe", state: "todo" },
          ]}
        />
        <ContactBlock />
      </JourneyShell>
    );
  }

  if (company) {
    return (
      <JourneyShell
        current={subscription ? "paiement" : "offre"}
        title={subscription ? "Il reste à régler votre adhésion" : "Choisissez votre offre"}
        subtitle="L'accès complet à la plateforme s'active dès la confirmation du paiement."
        card={card}
        headerAction={signOut}
      >
        <Button asChild size="lg" className="w-full justify-center gap-2">
          <Link href="/entreprise/paiement">
            {subscription ? "Régler mon adhésion" : "Choisir une offre"}{" "}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <ContactBlock />
      </JourneyShell>
    );
  }

  const intendedPlan = viewer?.intendedPlan ?? null;
  return (
    <JourneyShell
      current="compte"
      title="Créez la fiche de votre entreprise"
      subtitle={
        intendedPlan ? (
          <>
            Vous vous êtes inscrit pour l&apos;offre{" "}
            <strong>{cleanPlanName(intendedPlan.name)}</strong> (
            {formatEuro(planPriceEur(intendedPlan, eurToArRate))}
            {intendedPlan.pricingMode === "PER_PARTICIPANT" && " par participant"}
            <AriaryHint amountAr={intendedPlan.priceAr} exact className="ml-1 inline" />
            ). Il reste à créer la fiche de votre entreprise.
          </>
        ) : (
          "Votre compte est confirmé, mais aucune entreprise n'y est encore rattachée."
        )
      }
      card={card}
      headerAction={signOut}
    >
      <Button asChild size="lg" className="w-full justify-center gap-2">
        <Link
          href={intendedPlan ? `/entreprise/creer?offre=${intendedPlan.slug}` : "/entreprise/creer"}
        >
          Créer mon entreprise <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
      <ContactBlock />
    </JourneyShell>
  );
}

function StatusTimeline({
  items,
}: {
  items: { label: string; state: "done" | "current" | "todo" }[];
}) {
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => (
        <li key={item.label} className="relative flex gap-4 pb-6 last:pb-0">
          {i < items.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-[11px] top-6 h-[calc(100%-24px)] w-px",
                item.state === "done" ? "bg-gold" : "bg-border"
              )}
            />
          )}
          <span
            className={cn(
              "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              item.state === "done" && "bg-gold text-navy",
              item.state === "current" && "border-2 border-gold bg-white",
              item.state === "todo" && "border border-border bg-white"
            )}
          >
            {item.state === "done" && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            {item.state === "current" && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-gold motion-reduce:animate-none" />
            )}
          </span>
          <span
            className={cn(
              "text-sm",
              item.state === "current" ? "font-semibold text-navy" : "text-text-mid",
              item.state === "todo" && "text-text-muted"
            )}
          >
            {item.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ContactBlock() {
  return (
    <div className="mt-10 border-t border-border pt-6 text-sm text-text-mid">
      <p className="mb-2 font-semibold text-navy">Une question ?</p>
      <p>
        Inscriptions :{" "}
        <a href="mailto:register@ceo-summit.mg" className="text-navy-mid hover:underline">
          register@ceo-summit.mg
        </a>{" "}
        ·{" "}
        <a href="tel:+261380913114" className="text-navy-mid hover:underline">
          038 09 131 14
        </a>
      </p>
      <p>
        Plateforme :{" "}
        <a href="mailto:team@ceo-summit.mg" className="text-navy-mid hover:underline">
          team@ceo-summit.mg
        </a>{" "}
        ·{" "}
        <a href="tel:+261380113114" className="text-navy-mid hover:underline">
          038 01 131 14
        </a>
      </p>
    </div>
  );
}
