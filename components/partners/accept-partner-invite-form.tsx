"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { acceptPartnerInvite } from "@/app/actions/partner-invite";
import { ReferentialSelect } from "@/components/referentials/referential-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * Module 20 — inscription du gérant d'un partenaire : mot de passe et
 * entreprise, puis connexion automatique (même principe que l'invitation
 * d'un collaborateur).
 */
export function AcceptPartnerInviteForm({
  token,
  sectors,
  countries,
}: {
  token: string;
  sectors: string[];
  countries: string[];
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [sector, setSector] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await acceptPartnerInvite(token, {
        title,
        companyName,
        sector,
        country,
        password,
        confirmPassword,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const signInResult = await signIn("credentials", {
        email: result.data.email,
        password,
        redirect: false,
      });
      if (!signInResult || signInResult.error) {
        toast.error(
          "Votre compte est créé, mais la connexion automatique a échoué. Connectez-vous pour continuer."
        );
        router.push(`/login?callbackUrl=${encodeURIComponent("/bienvenue")}`);
        return;
      }
      router.push("/bienvenue");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partner-title">Votre fonction *</Label>
        <Input
          id="partner-title"
          placeholder="ex. Directeur général"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          autoComplete="organization-title"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partner-company">Nom de votre entreprise *</Label>
        <Input
          id="partner-company"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partner-sector">Secteur *</Label>
          <ReferentialSelect
            id="partner-sector"
            options={sectors}
            value={sector}
            onValueChange={setSector}
            searchTitle="Rechercher un secteur"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partner-country">Pays *</Label>
          <ReferentialSelect
            id="partner-country"
            options={countries}
            value={country}
            onValueChange={setCountry}
            searchTitle="Rechercher un pays"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partner-password">Choisissez votre mot de passe *</Label>
        <PasswordInput
          id="partner-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <p className="text-xs text-text-muted">
          Au moins 8 caractères, une majuscule et un chiffre.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partner-confirm-password">Confirmer le mot de passe *</Label>
        <PasswordInput
          id="partner-confirm-password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={loading} className="w-full justify-center">
        {loading ? "Création…" : "Créer mon compte"}
      </Button>
    </form>
  );
}
