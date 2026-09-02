"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import type { Plan } from "@prisma/client";

import { createCompanyAccount } from "@/app/actions/company-account";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatAriary } from "@/lib/utils";

interface CompanySignupWizardProps {
  plans: Plan[];
  intendedPlan?: Plan | null;
  sectors: string[];
  countries: string[];
}

/**
 * Checkout hybride Evolia (conception/07/09, 3 septembre 2026) — remplace
 * l'ancien `SignupForm` (compte seul) : offre choisie d'abord (état
 * d'assistant, aucune écriture avant soumission finale), puis inscription
 * du gestionnaire et de l'entreprise ensemble. Volontairement minimal — le
 * reste de la fiche entreprise et les collaborateurs viennent après
 * paiement (voir BACKLOG_MVP.md §3).
 */
export function CompanySignupWizard({
  plans,
  intendedPlan,
  sectors,
  countries,
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

  if (!planId) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-center text-sm text-text-muted">
          Choisissez l&apos;offre qui correspond à votre entreprise pour commencer.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-white p-5"
            >
              <p className="text-base font-bold text-navy">{plan.name}</p>
              {plan.description && <p className="text-sm text-text-mid">{plan.description}</p>}
              <p className="mt-1 text-lg font-bold text-navy">
                {formatAriary(plan.priceAr)}
                {plan.pricingMode === "FIXED_BUNDLE"
                  ? ` — forfait ${plan.includedSeats ?? "?"} sièges`
                  : " / participant / an"}
              </p>
              <Button onClick={() => setPlanId(plan.id)} className="mt-2 justify-center">
                Choisir cette offre
              </Button>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-text-muted">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-navy-mid">
            Connectez-vous
          </Link>
        </p>
      </div>
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
      await signIn("credentials", { email, password, redirect: false });
      router.push("/entreprise/paiement");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {selectedPlan && (
        <Alert variant="gold">
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              Offre choisie : <strong>{selectedPlan.name}</strong> —{" "}
              {formatAriary(selectedPlan.priceAr)}
            </span>
            {!intendedPlan && (
              <button
                type="button"
                onClick={() => setPlanId(null)}
                className="shrink-0 text-xs font-semibold text-navy-mid underline-offset-2 hover:underline"
              >
                Changer
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Votre compte</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-name">Votre nom complet</Label>
        <Input
          id="signup-name"
          placeholder="Jean-Pierre Rakoto"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">Adresse email</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="vous@entreprise.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-password">Mot de passe</Label>
          <Input
            id="signup-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="signup-confirm-password">Confirmer</Label>
          <Input
            id="signup-confirm-password"
            type="password"
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

      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Votre entreprise
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-company-name">Nom de l&apos;entreprise</Label>
        <Input
          id="signup-company-name"
          placeholder="ex. Rakoto Holding"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Secteur</Label>
          <Select value={sector} onValueChange={setSector}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Pays</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="-mt-2 text-xs text-text-muted">
        Le reste de la fiche entreprise (description, logo, coordonnées) et l&apos;ajout de vos
        collaborateurs se font juste après, une fois le paiement en cours.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" className="w-full justify-center" disabled={loading}>
        {loading ? "Création du compte…" : "Continuer vers le paiement"}
      </Button>

      <p className="text-center text-xs text-text-muted">
        Déjà un compte ?{" "}
        <Link href="/login" className="text-navy-mid">
          Connectez-vous
        </Link>
      </p>
    </form>
  );
}
