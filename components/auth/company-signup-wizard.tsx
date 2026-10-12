"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { ArrowRight, Check } from "lucide-react";
import type { Plan } from "@prisma/client";

import { createCompanyAccount } from "@/app/actions/company-account";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { AriaryHint } from "@/components/ui/ariary-hint";
import { JourneyShell } from "@/components/onboarding/journey-shell";
import { MembershipCard } from "@/components/onboarding/membership-card";
import { ReferentialSelect } from "@/components/referentials/referential-select";
import { cn, formatEuro, planPriceEur, pluralize } from "@/lib/utils";

interface CompanySignupWizardProps {
  plans: Plan[];
  intendedPlan?: Plan | null;
  sectors: string[];
  countries: string[];
  /**
   * Rapport QA du 30 sept. 2026 (§10) — cours du jour EUR→Ar, fourni par la
   * page serveur. N'affecte jamais le montant réellement facturé.
   */
  liveEurToArRate: number;
}

function seatsLabel(plan: Plan): string {
  if (plan.pricingMode === "PER_PARTICIPANT") {
    return plan.minParticipants && plan.minParticipants > 1
      ? `Par participant, à partir de ${plan.minParticipants}`
      : "Par participant";
  }
  return plan.maxTeamMembers != null
    ? `${pluralize(plan.maxTeamMembers, "participant")} inclus`
    : "Forfait entreprise";
}

/**
 * Checkout hybride Evolia (conception/07/09, 3 septembre 2026) — offre
 * choisie d'abord (état d'assistant, aucune écriture avant soumission
 * finale), puis inscription du gestionnaire et de l'entreprise ensemble.
 * Refonte du 9 oct. 2026 : cadre de parcours commun (JourneyShell) et carte
 * de membre qui se complète au fil de la saisie.
 */
export function CompanySignupWizard({
  plans,
  intendedPlan,
  sectors,
  countries,
  liveEurToArRate,
}: CompanySignupWizardProps) {
  const router = useRouter();
  const [planId, setPlanId] = React.useState<string | null>(intendedPlan?.id ?? null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [sector, setSector] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const selectedPlan = plans.find((p) => p.id === planId) ?? intendedPlan ?? null;

  const loginLink = (
    <p className="text-sm text-text-mid">
      Déjà membre ?{" "}
      <Link href="/login" className="font-semibold text-navy hover:underline">
        Se connecter
      </Link>
    </p>
  );

  const card = (
    <MembershipCard
      planName={selectedPlan?.name}
      priceEur={selectedPlan ? planPriceEur(selectedPlan, liveEurToArRate) : null}
      priceAr={
        selectedPlan
          ? selectedPlan.priceEur != null
            ? Math.round(selectedPlan.priceEur * liveEurToArRate)
            : selectedPlan.priceAr
          : null
      }
      priceSuffix={selectedPlan?.pricingMode === "PER_PARTICIPANT" ? " / participant" : undefined}
      detail={selectedPlan ? seatsLabel(selectedPlan) : null}
      companyName={companyName.trim() || null}
    />
  );

  if (!planId) {
    const bundles = plans.filter((p) => p.pricingMode !== "PER_PARTICIPANT");
    const perParticipant = plans.filter((p) => p.pricingMode === "PER_PARTICIPANT");
    return (
      <JourneyShell
        current="offre"
        wide
        title="Choisissez votre offre"
        subtitle="Chaque offre ouvre l'accès à la plateforme pour les collaborateurs de votre entreprise. Le paiement intervient après la création de votre compte."
        card={card}
        headerAction={loginLink}
      >
        <div className="flex flex-col gap-10">
          {[
            {
              label: "Forfaits entreprise",
              hint: "Un prix fixe, un nombre de places",
              list: bundles,
            },
            {
              label: "Tarif par participant",
              hint: "Vous indiquez votre effectif au paiement",
              list: perParticipant,
            },
          ]
            .filter((group) => group.list.length > 0)
            .map((group) => (
              <section key={group.label}>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                  <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-navy">
                    {group.label}
                  </h2>
                  <p className="text-xs text-text-muted">{group.hint}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.list.map((plan) => (
                    <OfferOption
                      key={plan.id}
                      plan={plan}
                      liveEurToArRate={liveEurToArRate}
                      onChoose={() => setPlanId(plan.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      </JourneyShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await createCompanyAccount({
        planId,
        name,
        email,
        password,
        confirmPassword,
        companyName,
        sector,
        country,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      // Audit (25 septembre 2026) — le résultat de signIn n'était jamais
      // vérifié : en cas d'échec, l'utilisateur atterrissait sur une page
      // protégée qui le renvoyait vers /login sans aucune explication.
      const signInResult = await signIn("credentials", { email, password, redirect: false });
      if (!signInResult || signInResult.error) {
        toast.error(
          "Votre compte est créé, mais la connexion automatique a échoué — connectez-vous pour continuer."
        );
        router.push(`/login?callbackUrl=${encodeURIComponent("/entreprise/paiement")}`);
        return;
      }
      router.push("/entreprise/paiement");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <JourneyShell
      current="compte"
      title="Créez votre compte"
      subtitle="Vous serez l'administrateur de cet espace. Une fois votre enregistrement effectué, vous pourrez inscrire vos collaborateurs selon le nombre de places incluses dans votre formule."
      card={card}
      headerAction={loginLink}
    >
      {selectedPlan && (
        <div className="mb-8 flex items-center justify-between gap-3 rounded-lg border border-gold-light bg-gold-pale px-4 py-3 text-sm">
          <span className="text-text-mid">
            Offre <strong className="text-navy">{selectedPlan.name}</strong> ·{" "}
            {formatEuro(planPriceEur(selectedPlan, liveEurToArRate))}
            {selectedPlan.pricingMode === "PER_PARTICIPANT" && " / participant"}
          </span>
          {!intendedPlan && (
            <button
              type="button"
              onClick={() => setPlanId(null)}
              className="shrink-0 text-xs font-semibold text-navy-mid underline-offset-2 hover:underline"
            >
              Changer d&apos;offre
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-4 text-sm font-bold uppercase tracking-[0.1em] text-navy">
            Vous
          </legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signup-name">Nom complet</Label>
            <Input
              id="signup-name"
              placeholder="Jean-Pierre Rakoto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signup-email">Adresse e-mail professionnelle</Label>
            <Input
              id="signup-email"
              type="email"
              placeholder="vous@entreprise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-password">Mot de passe</Label>
              <PasswordInput
                id="signup-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="signup-confirm-password">Confirmer le mot de passe</Label>
              <PasswordInput
                id="signup-confirm-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-text-muted">
            Au moins 8 caractères, une majuscule et un chiffre.
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-4 text-sm font-bold uppercase tracking-[0.1em] text-navy">
            Votre entreprise
          </legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="signup-company-name">Nom de l&apos;entreprise</Label>
            <Input
              id="signup-company-name"
              placeholder="ex. Rakoto Holding"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Secteur d&apos;activité</Label>
              <ReferentialSelect
                options={sectors}
                value={sector}
                onValueChange={setSector}
                placeholder="Sélectionner…"
                searchTitle="Rechercher un secteur"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Pays</Label>
              <ReferentialSelect
                options={countries}
                value={country}
                onValueChange={setCountry}
                placeholder="Sélectionner…"
                searchTitle="Rechercher un pays"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-text-muted">
            Logo, description et coordonnées se complètent plus tard, depuis l&apos;espace de votre
            entreprise.
          </p>
        </fieldset>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" size="lg" className="w-full justify-center gap-2" disabled={loading}>
          {loading ? (
            "Création du compte…"
          ) : (
            <>
              Continuer vers le paiement <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </JourneyShell>
  );
}

function OfferOption({
  plan,
  liveEurToArRate,
  onChoose,
}: {
  plan: Plan;
  liveEurToArRate: number;
  onChoose: () => void;
}) {
  const estimatedAr =
    plan.priceEur != null ? Math.round(plan.priceEur * liveEurToArRate) : plan.priceAr;
  return (
    <button
      type="button"
      onClick={onChoose}
      className={cn(
        "group flex flex-col rounded-lg border border-border bg-white p-5 text-left transition",
        "hover:-translate-y-0.5 hover:border-gold hover:shadow-card-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      )}
    >
      <span className="font-serif text-xl font-bold text-navy">{plan.name}</span>
      <span className="mt-1 text-xs text-text-muted">{seatsLabel(plan)}</span>
      {plan.description && (
        <span className="mt-3 line-clamp-3 text-sm leading-relaxed text-text-mid">
          {plan.description}
        </span>
      )}
      <span className="mt-auto pt-5">
        <span className="block text-2xl font-bold tabular-nums text-navy">
          {formatEuro(planPriceEur(plan, liveEurToArRate))}
          {plan.pricingMode === "PER_PARTICIPANT" && (
            <span className="text-sm font-semibold text-text-mid"> / participant</span>
          )}
        </span>
        <AriaryHint amountAr={estimatedAr} />
      </span>
      <span className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-navy-mid group-hover:text-navy">
        <Check className="h-4 w-4 text-gold" />
        Choisir cette offre
      </span>
    </button>
  );
}
