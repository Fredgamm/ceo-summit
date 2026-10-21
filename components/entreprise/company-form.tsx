"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageUp } from "lucide-react";

import { createCompany, updateCompany } from "@/app/actions/company";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReferentialSelect } from "@/components/referentials/referential-select";

export interface CompanyFormValues {
  name: string;
  sector: string;
  country: string;
  description: string;
  website: string;
  logoUrl: string;
  phone: string;
  address: string;
  linkedinUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  additionalInfo: string;
}

const EMPTY_VALUES: CompanyFormValues = {
  name: "",
  sector: "",
  country: "",
  description: "",
  website: "",
  logoUrl: "",
  phone: "",
  address: "",
  linkedinUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  additionalInfo: "",
};

interface CompanyFormProps {
  mode: "create" | "edit";
  companyId?: string;
  initialValues?: Partial<CompanyFormValues>;
  /**
   * Sprint du 5 août 2026 — lien profond `?offre=<slug>` porté depuis
   * `/entreprise/creer` jusqu'à la redirection post-création vers
   * `/entreprise/paiement`, où l'offre choisie se résout réellement (voir
   * app/entreprise/paiement/page.tsx).
   */
  offerSlug?: string;
  /** Référentiels admin-éditables (E8-T11, 5 août 2026) — fournis par la page serveur parente. */
  sectors: string[];
  countries: string[];
}

/** Parcours revu (1er août 2026) — coordonnées, réseaux sociaux et logo ajoutés. */
export function CompanyForm({
  mode,
  companyId,
  initialValues,
  offerSlug,
  sectors,
  countries,
}: CompanyFormProps) {
  const router = useRouter();
  const [values, setValues] = React.useState<CompanyFormValues>({
    ...EMPTY_VALUES,
    ...initialValues,
  });
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function set<K extends keyof CompanyFormValues>(key: K, value: CompanyFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/company/logo", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Échec de l'upload du logo.");
        return;
      }
      set("logoUrl", json.data.url);
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "create" ? await createCompany(values) : await updateCompany(companyId!, values);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const destination =
        mode === "create"
          ? `/entreprise/paiement${offerSlug ? `?offre=${encodeURIComponent(offerSlug)}` : ""}`
          : `/entreprises/${companyId}`;
      router.push(destination);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // Mobile (21 oct. 2026) : champs empilés sous 640 px — les grilles à 2 et 3
    // colonnes ne laissaient que ~90 px par champ sur un téléphone.
    <div className="max-w-[560px] rounded-lg border border-border bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 shrink-0 rounded-lg">
            <AvatarImage src={values.logoUrl || undefined} alt="Logo" />
            <AvatarFallback className="rounded-lg">
              {values.name ? values.name.slice(0, 2).toUpperCase() : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <Label htmlFor="company-logo">Logo (optionnel)</Label>
            {/* Sélecteur natif masqué : son rendu (« Choisir un fichier · Aucun
                fichier choisi ») varie selon le navigateur et déborde sur mobile. */}
            <input
              ref={logoInputRef}
              id="company-logo"
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              disabled={uploadingLogo}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
            >
              <ImageUp />
              {uploadingLogo
                ? "Envoi en cours…"
                : values.logoUrl
                  ? "Changer le logo"
                  : "Choisir un logo"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-name">Nom de l&apos;entreprise *</Label>
          <Input
            id="company-name"
            placeholder="ex. Rakoto Holding"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={120}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Secteur *</Label>
            <ReferentialSelect
              options={sectors}
              value={values.sector}
              onValueChange={(v) => set("sector", v)}
              placeholder="Sélectionner…"
              searchTitle="Rechercher un secteur"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Pays *</Label>
            <ReferentialSelect
              options={countries}
              value={values.country}
              onValueChange={(v) => set("country", v)}
              placeholder="Sélectionner…"
              searchTitle="Rechercher un pays"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-website">Site web</Label>
            <Input
              id="company-website"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://..."
              value={values.website}
              onChange={(e) => set("website", e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-phone">Téléphone</Label>
            <Input
              id="company-phone"
              type="tel"
              autoComplete="tel"
              placeholder="+261 34 00 000 00"
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
              maxLength={40}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-address">Adresse</Label>
          <Input
            id="company-address"
            placeholder="Adresse complète"
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            maxLength={300}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-linkedin">LinkedIn</Label>
            <Input
              id="company-linkedin"
              type="url"
              inputMode="url"
              placeholder="https://linkedin.com/…"
              value={values.linkedinUrl}
              onChange={(e) => set("linkedinUrl", e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-facebook">Facebook</Label>
            <Input
              id="company-facebook"
              type="url"
              inputMode="url"
              placeholder="https://facebook.com/…"
              value={values.facebookUrl}
              onChange={(e) => set("facebookUrl", e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-instagram">Instagram</Label>
            <Input
              id="company-instagram"
              type="url"
              inputMode="url"
              placeholder="https://instagram.com/…"
              value={values.instagramUrl}
              onChange={(e) => set("instagramUrl", e.target.value)}
              maxLength={300}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-desc">Description</Label>
          <Textarea
            id="company-desc"
            rows={4}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={1000}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company-additional">Informations complémentaires</Label>
          <Textarea
            id="company-additional"
            rows={3}
            value={values.additionalInfo}
            onChange={(e) => set("additionalInfo", e.target.value)}
            maxLength={1000}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleSubmit}
          disabled={submitting || uploadingLogo}
          className="justify-center"
        >
          {submitting
            ? "Enregistrement…"
            : mode === "create"
              ? "✓ Créer l'entreprise"
              : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
