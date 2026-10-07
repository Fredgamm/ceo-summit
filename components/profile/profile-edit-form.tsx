"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { updateProfile } from "@/app/actions/profile";
import { AVATAR_ALLOWED_MIME_TYPES, AVATAR_MAX_BYTES } from "@/lib/validations/profile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { initials } from "@/lib/utils";
import { ReferentialSelect } from "@/components/referentials/referential-select";
import { ReferentialSearchButton } from "@/components/referentials/referential-search-button";
import { visibleReferentialOptions } from "@/lib/referential-options";

interface ProfileEditFormProps {
  userId: string;
  initialName: string;
  initialTitle: string;
  initialBio: string;
  initialWebsiteUrl: string;
  initialLinkedinUrl: string;
  initialCountry: string;
  initialSectors: string[];
  initialAvatarUrl: string | null;
  initialPhone: string;
  /** Référentiels admin-éditables (E8-T11, 5 août 2026) — fournis par la page serveur parente. */
  availableCountries: string[];
  availableSectors: string[];
}

/**
 * E2-T02 — édition profil. Photo upload posts immediately to
 * /api/profile/avatar on file selection (server resizes to 400x400 and
 * persists avatarUrl right away); the rest of the fields save together via
 * the "Enregistrer" button (backlog offers auto-save-or-explicit-button —
 * explicit is simpler and more predictable than a debounce).
 */
export function ProfileEditForm({
  initialName,
  initialTitle,
  initialBio,
  initialWebsiteUrl,
  initialLinkedinUrl,
  initialCountry,
  initialSectors,
  initialAvatarUrl,
  initialPhone,
  availableCountries,
  availableSectors,
}: ProfileEditFormProps) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [name, setName] = React.useState(initialName);
  const [title, setTitle] = React.useState(initialTitle);
  const [bio, setBio] = React.useState(initialBio);
  const [websiteUrl, setWebsiteUrl] = React.useState(initialWebsiteUrl);
  const [linkedinUrl, setLinkedinUrl] = React.useState(initialLinkedinUrl);
  const [country, setCountry] = React.useState(initialCountry);
  const [phone, setPhone] = React.useState(initialPhone);
  const [sectors, setSectors] = React.useState<string[]>(initialSectors);
  const [avatarUrl, setAvatarUrl] = React.useState(initialAvatarUrl);

  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState<string | null>(null);

  function toggleSector(sector: string) {
    setSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);

    if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type)) {
      setAvatarError("Format non supporté (JPG, PNG ou WEBP uniquement).");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError("Fichier trop volumineux (5 Mo max).");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setAvatarError(json.error ?? "Échec de l'envoi de la photo.");
        return;
      }
      setAvatarUrl(json.data.url);
      router.refresh();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const result = await updateProfile({
        name,
        title,
        bio,
        websiteUrl,
        linkedinUrl,
        country,
        sectors,
        phone,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <Avatar className="h-20 w-20">
            <AvatarImage src={avatarUrl ?? undefined} alt={name} />
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={AVATAR_ALLOWED_MIME_TYPES.join(",")}
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Envoi…" : "Changer la photo"}
            </Button>
            <p className="mt-1.5 text-xs text-text-muted">JPG, PNG ou WEBP — 5 Mo max.</p>
            {avatarError && <p className="mt-1 text-xs text-red-600">{avatarError}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-name">Nom complet *</Label>
              <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-title">Titre / Poste *</Label>
              <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-phone">Téléphone (optionnel)</Label>
            <Input
              id="edit-phone"
              type="tel"
              placeholder="034 12 345 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-text-muted">
              Utilisé pour vous notifier par SMS lors d&apos;un achat groupé entreprise.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-country">Pays</Label>
            <ReferentialSelect
              id="edit-country"
              options={availableCountries}
              value={country}
              onValueChange={setCountry}
              searchTitle="Rechercher un pays"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-bio">Bio professionnelle</Label>
            <Textarea
              id="edit-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={750}
            />
            <p className="text-right text-xs text-text-muted">{bio.length}/750</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-website">Site web (optionnel)</Label>
            <Input
              id="edit-website"
              placeholder="monentreprise.mg"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-linkedin">LinkedIn (optionnel)</Label>
            <Input
              id="edit-linkedin"
              placeholder="linkedin.com/in/votre-profil"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Secteurs d&apos;intérêt</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {visibleReferentialOptions(availableSectors, sectors).map((sector) => (
              <label
                key={sector}
                className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm"
              >
                <Checkbox
                  checked={sectors.includes(sector)}
                  onCheckedChange={() => toggleSector(sector)}
                />
                {sector}
              </label>
            ))}
            <ReferentialSearchButton
              options={availableSectors}
              title="Rechercher un secteur"
              selected={sectors}
              onPick={(sector) => {
                if (!sectors.includes(sector)) toggleSector(sector);
              }}
              className="flex items-center justify-center rounded-md border border-dashed border-border p-2.5 text-sm font-semibold text-navy-mid hover:border-navy-light"
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert variant="success">
          <AlertDescription>Profil enregistré avec succès.</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer les modifications"}
        </Button>
      </div>
    </div>
  );
}
