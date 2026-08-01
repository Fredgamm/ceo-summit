"use client";

import * as React from "react";
import Link from "next/link";

import { submitApplication } from "@/app/actions/apply";
import { SECTORS } from "@/lib/sectors";
import { COUNTRIES } from "@/lib/countries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { tierLabel } from "@/lib/utils";

const TIERS = [
  { value: "MEMBER" as const, price: "200 000 Ar/an" },
  { value: "EXECUTIVE" as const, price: "600 000 Ar/an" },
  { value: "CHAIRMAN" as const, price: "1 500 000 Ar/an" },
];

/** B1 (audit du 29 juillet 2026) — formulaire public de candidature, wireframe/demande-acces.html. */
export function ApplicationForm() {
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [sector, setSector] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [requestedTier, setRequestedTier] = React.useState<"MEMBER" | "EXECUTIVE" | "CHAIRMAN">(
    "EXECUTIVE"
  );
  const [consent, setConsent] = React.useState(false);

  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLoading(true);
    try {
      const result = await submitApplication({
        fullName,
        email,
        companyName,
        title,
        sector: sector as never,
        country: country as never,
        requestedTier,
        consent: consent as true,
      });
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <Alert variant="success" role="status">
        <AlertDescription>
          Votre candidature a bien été envoyée. Notre équipe vous répondra sous 48 à 72h ouvrées —
          vous recevrez un email de confirmation.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-fullname">
            Nom complet <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="app-fullname"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jean-Pierre Rakoto"
            required
            aria-required="true"
            autoComplete="name"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-title">
            Fonction / Titre <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="app-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Directeur Général"
            required
            aria-required="true"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-company">
            Entreprise <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="app-company"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Nom de votre entreprise"
            required
            aria-required="true"
            autoComplete="organization"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-email">
            Email professionnel <span aria-hidden="true">*</span>
          </Label>
          <Input
            id="app-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@entreprise.com"
            required
            aria-required="true"
            autoComplete="email"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-country">
            Pays d&apos;activité <span aria-hidden="true">*</span>
          </Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger id="app-country" aria-required="true">
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-sector">
            Secteur d&apos;activité <span aria-hidden="true">*</span>
          </Label>
          <Select value={sector} onValueChange={setSector}>
            <SelectTrigger id="app-sector" aria-required="true">
              <SelectValue placeholder="Sélectionner votre secteur…" />
            </SelectTrigger>
            <SelectContent>
              {SECTORS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Niveau de membership souhaité <span aria-hidden="true">*</span>
        </legend>
        <div
          className="grid grid-cols-3 gap-2.5"
          role="radiogroup"
          aria-label="Niveau de membership souhaité"
        >
          {TIERS.map((t) => (
            <label
              key={t.value}
              className={`cursor-pointer rounded-md border-2 p-3 text-center transition-colors ${
                requestedTier === t.value ? "border-navy" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="requestedTier"
                value={t.value}
                checked={requestedTier === t.value}
                onChange={() => setRequestedTier(t.value)}
                className="sr-only"
              />
              <div className="text-sm font-extrabold text-navy">{tierLabel(t.value)}</div>
              <div className="mt-1 text-xs text-text-muted">{t.price}</div>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="app-consent"
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          required
          aria-required="true"
          className="mt-0.5"
        />
        <Label htmlFor="app-consent" className="text-sm font-normal leading-relaxed text-text-mid">
          J&apos;accepte les{" "}
          <Link href="/cgu" className="text-navy underline">
            conditions d&apos;utilisation
          </Link>{" "}
          et la{" "}
          <Link href="/confidentialite" className="text-navy underline">
            politique de confidentialité
          </Link>{" "}
          de CEO Summit.
        </Label>
      </div>

      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="lg" className="w-full justify-center" disabled={loading}>
        {loading ? "Envoi…" : "Envoyer ma candidature →"}
      </Button>

      <p className="text-center text-sm text-text-muted">
        Déjà membre ?{" "}
        <Link href="/login" className="font-semibold text-navy">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
