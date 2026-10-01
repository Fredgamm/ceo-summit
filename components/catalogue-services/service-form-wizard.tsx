"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { submitServiceListing, updateServiceListing } from "@/app/actions/services";
import { SERVICE_CATEGORIES } from "@/lib/service-categories";
import {
  SERVICE_GALLERY_ALLOWED_MIME_TYPES,
  SERVICE_GALLERY_MAX_BYTES,
  SERVICE_GALLERY_MAX_IMAGES,
} from "@/lib/validations/service";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STEP_COUNT = 3;
const STEP_LABELS = ["Catégorie & titre", "Description & tarif", "Visuels & récap"];

interface FormValues {
  category: string;
  title: string;
  description: string;
  priceInfo: string;
  gallery: string[];
}

const EMPTY_VALUES: FormValues = {
  category: "",
  title: "",
  description: "",
  priceInfo: "",
  gallery: [],
};

/**
 * E5-T03 — stepper 3 étapes : catégorie+titre, description+tarif, visuels+récap+soumettre.
 *
 * `mode`/`initialValues`/`serviceId`/`onDone` (rapport QA du 1er oct. 2026,
 * §2.5) — réédition d'une fiche depuis l'onglet "Services" de la fiche
 * entreprise, sur le modèle de CompanyForm (mode="create"|"edit"). `onDone`
 * est optionnel : sans lui, le comportement de création d'origine est
 * inchangé (redirection vers la fiche publique) ; fourni par
 * CompanyServicesManager pour revenir à la liste plutôt que de naviguer.
 */
export function ServiceFormWizard({
  mode = "create",
  serviceId,
  initialValues,
  onDone,
}: {
  mode?: "create" | "edit";
  serviceId?: string;
  initialValues?: FormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [values, setValues] = React.useState<FormValues>(initialValues ?? EMPTY_VALUES);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function canAdvanceFrom(currentStep: number): string | null {
    if (currentStep === 1) {
      if (!values.category) return "La catégorie est requise.";
      if (values.title.trim().length < 10) return "Le titre doit contenir au moins 10 caractères.";
    }
    if (currentStep === 2 && values.description.trim().length < 20) {
      return "La description doit contenir au moins 20 caractères.";
    }
    return null;
  }

  function handleNext() {
    const validationError = canAdvanceFrom(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEP_COUNT));
  }

  async function handleGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);

    if (values.gallery.length >= SERVICE_GALLERY_MAX_IMAGES) {
      setUploadError(`Maximum ${SERVICE_GALLERY_MAX_IMAGES} visuels.`);
      return;
    }
    if (!SERVICE_GALLERY_ALLOWED_MIME_TYPES.includes(file.type)) {
      setUploadError("Format non supporté (JPG, PNG ou WEBP uniquement).");
      return;
    }
    if (file.size > SERVICE_GALLERY_MAX_BYTES) {
      setUploadError("Fichier trop volumineux (5 Mo max).");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/services/gallery", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? "Échec de l'envoi.");
        return;
      }
      set("gallery", [...values.gallery, json.data.url]);
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    set(
      "gallery",
      values.gallery.filter((u) => u !== url)
    );
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "edit") {
        const result = await updateServiceListing(serviceId!, values);
        if (!result.success) {
          setError(result.error);
          return;
        }
        if (onDone) onDone();
        else router.refresh();
        return;
      }
      const result = await submitServiceListing(values);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (onDone) onDone();
      else router.push(`/catalogue/services/${result.data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-6 flex gap-1.5">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex-1 text-center">
            <div
              className={`mx-auto mb-1 h-1.5 rounded-full ${i + 1 <= step ? "bg-gold" : "bg-border"}`}
            />
            <span className="text-[11px] text-text-muted">{label}</span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="rounded-lg border border-border bg-white p-6">
          <h2 className="mb-4 text-base font-bold text-navy">Catégorie & titre</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Catégorie *</Label>
              <Select value={values.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-title">Titre de la fiche *</Label>
              <Input
                id="svc-title"
                placeholder="Ex : Audit stratégique & accompagnement levée de fonds"
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                maxLength={140}
              />
              <p className="text-right text-xs text-text-muted">{values.title.length}/140</p>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-lg border border-border bg-white p-6">
          <h2 className="mb-4 text-base font-bold text-navy">Description & tarif</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-desc">Description *</Label>
              <Textarea
                id="svc-desc"
                rows={7}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="svc-price">Tarif indicatif</Label>
              <Input
                id="svc-price"
                placeholder="Ex : Sur devis, À partir de 500 000 Ar…"
                value={values.priceInfo}
                onChange={(e) => set("priceInfo", e.target.value)}
                maxLength={140}
              />
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-1.5 text-base font-bold text-navy">Visuels</h2>
            <p className="mb-4 text-xs text-text-muted">
              JPG, PNG ou WEBP · Max 5 Mo par fichier · {SERVICE_GALLERY_MAX_IMAGES} visuels max
            </p>
            <Input
              type="file"
              accept={SERVICE_GALLERY_ALLOWED_MIME_TYPES.join(",")}
              onChange={handleGalleryChange}
              disabled={uploading || values.gallery.length >= SERVICE_GALLERY_MAX_IMAGES}
            />
            {uploading && <p className="mt-1.5 text-xs text-text-muted">Envoi…</p>}
            {uploadError && <p className="mt-1.5 text-xs text-red-600">{uploadError}</p>}

            {values.gallery.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {values.gallery.map((url) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-20 w-full rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border-2 border-border bg-white p-5">
            {values.category && (
              <span className="mb-2 inline-block rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-navy">
                {values.category}
              </span>
            )}
            <p className="mb-2 text-lg font-bold text-navy">
              {values.title || "Titre de la fiche"}
            </p>
            <p className="text-sm text-text-mid">{values.description || "Description…"}</p>
            {values.priceInfo && <p className="mt-2 text-xs text-text-muted">{values.priceInfo}</p>}
          </div>

          <Alert>
            <AlertDescription>
              {mode === "edit"
                ? "Votre modification sera resoumise à validation par l'équipe CEO Summit avant de redevenir visible. Vous serez notifié(e) par email dès sa mise en ligne."
                : "Votre fiche sera soumise à validation par l'équipe CEO Summit avant publication. Vous serez notifié(e) par email dès sa mise en ligne."}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex justify-between">
        {step > 1 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
            ← Retour
          </Button>
        ) : (
          <span />
        )}
        {step < STEP_COUNT ? (
          <Button onClick={handleNext}>Étape suivante →</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? "Envoi…"
              : mode === "edit"
                ? "Enregistrer les modifications"
                : "Soumettre pour publication"}
          </Button>
        )}
      </div>
    </div>
  );
}
