"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Tier } from "@prisma/client";

import { publishOpportunity, resubmitOpportunity } from "@/app/actions/deal-room";
import {
  OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES,
  OPPORTUNITY_ATTACHMENT_MAX_BYTES,
  OPPORTUNITY_ATTACHMENT_MAX_COUNT,
} from "@/lib/validations/opportunity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAriary, formatEuro, formatDateFr } from "@/lib/utils";
import { ReferentialSelect } from "@/components/referentials/referential-select";

const STEP_COUNT = 4;
const STEP_LABELS = ["Type & catégorie", "Titre & description", "Budget & documents", "Aperçu"];

interface FormValues {
  type: string;
  sector: string;
  country: string;
  title: string;
  description: string;
  budget: string;
  budgetEur: string;
  deadline: string;
  visibility: Tier;
  attachments: { key: string; name: string }[];
}

const EMPTY_VALUES: FormValues = {
  type: "",
  sector: "",
  country: "",
  title: "",
  description: "",
  budget: "",
  budgetEur: "",
  deadline: "",
  visibility: "MEMBER",
  attachments: [],
};

/**
 * E6-T03 — stepper 4 étapes : type+secteur+pays, titre+description, budget+échéance+visibilité+documents, récap.
 *
 * `editOpportunityId`/`initialValues` (sprint de correction du 5 août 2026,
 * EX-T01) — réédition d'une opportunité REFUSED/CHANGES_REQUESTED : même
 * formulaire, soumission vers `resubmitOpportunity` au lieu de
 * `publishOpportunity`, pré-rempli avec les valeurs existantes.
 */
export function PublishWizard({
  authorName,
  authorTitle,
  editOpportunityId,
  initialValues,
  types,
  sectors,
  countries,
}: {
  authorName: string;
  authorTitle: string;
  editOpportunityId?: string;
  initialValues?: FormValues;
  /** Référentiels admin-éditables (E8-T11, 5 août 2026) — fournis par la page serveur parente. */
  types: string[];
  sectors: string[];
  countries: string[];
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
      if (!values.type) return "Le type d'opportunité est requis.";
      if (!values.sector) return "Le secteur est requis.";
      if (!values.country) return "La zone géographique est requise.";
    }
    if (currentStep === 2) {
      if (values.title.trim().length < 10) return "Le titre doit contenir au moins 10 caractères.";
      if (values.description.trim().length < 20)
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

  async function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    if (values.attachments.length >= OPPORTUNITY_ATTACHMENT_MAX_COUNT) {
      setUploadError(`Maximum ${OPPORTUNITY_ATTACHMENT_MAX_COUNT} documents.`);
      return;
    }
    if (!OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES.includes(file.type)) {
      setUploadError("Format non supporté (PDF uniquement).");
      return;
    }
    if (file.size > OPPORTUNITY_ATTACHMENT_MAX_BYTES) {
      setUploadError("Fichier trop volumineux (10 Mo max).");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/deal-room/attachment", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? "Échec de l'envoi.");
        return;
      }
      set("attachments", [...values.attachments, { key: json.data.key, name: json.data.name }]);
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(key: string) {
    set(
      "attachments",
      values.attachments.filter((a) => a.key !== key)
    );
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        type: values.type,
        sector: values.sector,
        country: values.country,
        title: values.title,
        description: values.description,
        budget: values.budget,
        budgetEur: values.budgetEur,
        deadline: values.deadline,
        visibility: values.visibility,
        attachments: values.attachments.map((a) => a.key),
      };

      if (editOpportunityId) {
        const result = await resubmitOpportunity(editOpportunityId, payload);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push(`/deal-room/${editOpportunityId}`);
        return;
      }

      const result = await publishOpportunity(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/deal-room/${result.data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <Alert variant="gold" className="mb-6">
        <AlertDescription>
          La publication est <strong>gratuite</strong>. L&apos;accès aux coordonnées l&apos;est
          aussi pour tout membre intéressé.
        </AlertDescription>
      </Alert>

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
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-4 text-base font-bold text-navy">Type d&apos;opportunité</h2>
            <div className="grid grid-cols-2 gap-3">
              {types.map((t) => (
                <label
                  key={t}
                  className={`cursor-pointer rounded-md border-2 p-3 text-sm ${
                    values.type === t ? "border-navy bg-surface" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    className="hidden"
                    checked={values.type === t}
                    onChange={() => set("type", t)}
                  />
                  <span className="font-semibold text-navy">{t}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-4 text-base font-bold text-navy">Secteur & zone géographique</h2>
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Zone géographique *</Label>
                <ReferentialSelect
                  options={countries}
                  value={values.country}
                  onValueChange={(v) => set("country", v)}
                  placeholder="Sélectionner…"
                  searchTitle="Rechercher un pays"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-lg border border-border bg-white p-6">
          <h2 className="mb-4 text-base font-bold text-navy">Titre & description</h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opp-title">Titre de l&apos;opportunité *</Label>
              <Input
                id="opp-title"
                placeholder="Ex : Recherche partenaire distribution — Région Nord Madagascar"
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                maxLength={140}
              />
              <p className="text-right text-xs text-text-muted">{values.title.length}/140</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opp-desc">Description *</Label>
              <Textarea
                id="opp-desc"
                rows={7}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-1.5 text-base font-bold text-navy">Budget & échéance</h2>
            <p className="mb-4 text-xs text-text-muted">
              Saisissez le budget dans la devise de votre choix — les deux champs sont optionnels et
              indépendants.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="opp-budget">Budget indicatif (Ar)</Label>
                <Input
                  id="opp-budget"
                  type="number"
                  min={0}
                  placeholder="Optionnel"
                  value={values.budget}
                  onChange={(e) => set("budget", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="opp-budget-eur">Budget indicatif (€)</Label>
                <Input
                  id="opp-budget-eur"
                  type="number"
                  min={0}
                  placeholder="Optionnel"
                  value={values.budgetEur}
                  onChange={(e) => set("budgetEur", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="opp-deadline">Date limite de réponse</Label>
                <Input
                  id="opp-deadline"
                  type="date"
                  value={values.deadline}
                  onChange={(e) => set("deadline", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-white p-6">
            <h2 className="mb-1.5 text-base font-bold text-navy">Documents annexes</h2>
            <p className="mb-4 text-xs text-text-muted">
              PDF uniquement · Max 10 Mo par fichier · 3 documents max
            </p>
            <Input
              type="file"
              accept={OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES.join(",")}
              onChange={handleAttachmentChange}
              disabled={uploading || values.attachments.length >= OPPORTUNITY_ATTACHMENT_MAX_COUNT}
            />
            {uploading && <p className="mt-1.5 text-xs text-text-muted">Envoi…</p>}
            {uploadError && <p className="mt-1.5 text-xs text-red-600">{uploadError}</p>}

            {values.attachments.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {values.attachments.map((a) => (
                  <li
                    key={a.key}
                    className="flex items-center justify-between rounded-md bg-surface p-2.5 text-sm"
                  >
                    <span>📄 {a.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.key)}
                      aria-label={`Retirer ${a.name}`}
                      className="text-text-muted"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border-2 border-border bg-white p-5">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-navy">
                {values.type}
              </span>
              {values.sector && (
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-navy">
                  {values.sector}
                </span>
              )}
            </div>
            <p className="mb-2 text-lg font-bold text-navy">
              {values.title || "Titre de l'opportunité"}
            </p>
            <p className="mb-3 text-sm text-text-mid">{values.description || "Description…"}</p>
            <div className="flex flex-wrap gap-3 text-xs text-text-muted">
              {values.budget && <span>💰 {formatAriary(Number(values.budget))}</span>}
              {values.budgetEur && <span>💶 {formatEuro(Number(values.budgetEur))}</span>}
              {values.deadline && <span>🏁 Délai : {formatDateFr(new Date(values.deadline))}</span>}
              <span>
                📎 {values.attachments.length} document{values.attachments.length !== 1 ? "s" : ""}{" "}
                joint{values.attachments.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm">
              <span className="font-semibold text-navy">{authorName}</span>
              <span className="text-text-muted">{authorTitle}</span>
            </div>
          </div>

          <Alert>
            <AlertDescription>
              Votre opportunité sera soumise à validation par l&apos;équipe CEO Summit avant
              publication. Vous serez notifié(e) par email dès sa mise en ligne.
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
              : editOpportunityId
                ? "🚀 Resoumettre pour modération"
                : "🚀 Soumettre pour publication"}
          </Button>
        )}
      </div>
    </div>
  );
}
