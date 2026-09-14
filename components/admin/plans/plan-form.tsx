"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlanPricingMode } from "@prisma/client";

import { createPlan, updatePlan } from "@/app/actions/admin-plans";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export interface PlanPriceBracketFormValues {
  minParticipants: number;
  maxParticipants: number | null;
  unitPriceAr: number;
  unitPriceEur: number | null;
}

export interface PlanFormValues {
  name: string;
  slug: string;
  description: string;
  priceAr: number;
  priceEur: number | null;
  maxTeamMembers: number | null;
  minParticipants: number | null;
  pricingMode: PlanPricingMode | null;
  includedSeats: number | null;
  priceBrackets: PlanPriceBracketFormValues[];
  includedCredits: number;
  hasUnlimitedCredits: boolean;
  rank: number;
  eligibilityNote: string;
  isActive: boolean;
  isSelfService: boolean;
  displayOrder: number;
  eventId: string;
  linkedPlatformPlanId: string;
}

const EMPTY_VALUES: PlanFormValues = {
  name: "",
  slug: "",
  description: "",
  priceAr: 0,
  priceEur: null,
  maxTeamMembers: null,
  minParticipants: null,
  pricingMode: null,
  includedSeats: null,
  priceBrackets: [],
  includedCredits: 0,
  hasUnlimitedCredits: false,
  rank: 1,
  eligibilityNote: "",
  isActive: true,
  isSelfService: true,
  displayOrder: 0,
  eventId: "",
  linkedPlatformPlanId: "",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const EMPTY_BRACKET: PlanPriceBracketFormValues = {
  minParticipants: 1,
  maxParticipants: null,
  unitPriceAr: 0,
  unitPriceEur: null,
};

/**
 * 14 septembre 2026 (TIERED_GROUP) — éditeur de la liste de paliers d'une
 * offre à tarif dégressif par taille de groupe (ex. 10-29 participants ->
 * 650 Ar/pers., 30 et plus -> 500 Ar/pers.). Nombre de paliers illimité,
 * ajoutés/retirés librement par l'admin — la validation de la cohérence
 * (chevauchement, ordre) se fait côté serveur (lib/validations/plan.ts).
 * Même convention € -> Ar que le prix de base de l'offre : quand un prix
 * unitaire en euros est renseigné, l'ariary correspondant est recalculé au
 * taux du jour à l'enregistrement (voir app/actions/admin-plans.ts).
 */
function PriceBracketEditor({
  brackets,
  onChange,
}: {
  brackets: PlanPriceBracketFormValues[];
  onChange: (brackets: PlanPriceBracketFormValues[]) => void;
}) {
  function updateBracket(index: number, patch: Partial<PlanPriceBracketFormValues>) {
    onChange(brackets.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function removeBracket(index: number) {
    onChange(brackets.filter((_, i) => i !== index));
  }

  function addBracket() {
    const last = brackets[brackets.length - 1];
    const nextMin =
      last?.maxParticipants != null ? last.maxParticipants + 1 : (last?.minParticipants ?? 0) + 1;
    onChange([...brackets, { ...EMPTY_BRACKET, minParticipants: nextMin }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Paliers de prix par taille de groupe</Label>
      <div className="flex flex-col gap-2">
        {brackets.map((bracket, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2">
            <div className="flex flex-col gap-1">
              {i === 0 && <span className="text-xs text-text-muted">À partir de</span>}
              <Input
                type="number"
                min={1}
                value={bracket.minParticipants}
                onChange={(e) => updateBracket(i, { minParticipants: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1">
              {i === 0 && (
                <span className="text-xs text-text-muted">Jusqu&apos;à (vide = illimité)</span>
              )}
              <Input
                type="number"
                min={1}
                value={bracket.maxParticipants ?? ""}
                onChange={(e) =>
                  updateBracket(i, {
                    maxParticipants: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              {i === 0 && <span className="text-xs text-text-muted">Prix unitaire (€)</span>}
              <Input
                type="number"
                min={0}
                placeholder="Laisser vide pour coter en Ar"
                value={bracket.unitPriceEur ?? ""}
                onChange={(e) =>
                  updateBracket(i, {
                    unitPriceEur: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              {i === 0 && (
                <span className="text-xs text-text-muted">
                  {bracket.unitPriceEur != null ? "≈ Prix (Ar)" : "Prix unitaire (Ar)"}
                </span>
              )}
              <Input
                type="number"
                min={0}
                disabled={bracket.unitPriceEur != null}
                value={bracket.unitPriceAr}
                onChange={(e) => updateBracket(i, { unitPriceAr: Number(e.target.value) })}
              />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => removeBracket(i)}>
              ✕
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={addBracket}
        className="self-start"
      >
        + Ajouter un palier
      </Button>
      <p className="text-xs text-text-muted">
        Chaque participant est facturé au prix unitaire du palier atteint par le nombre total de
        participants déclarés (ex. 12 participants dans un palier 10-29 à 650 Ar/pers. ⇒ 12 × 650 Ar
        au total). Laissez la borne haute du dernier palier vide pour un palier ouvert (&quot;30 et
        plus&quot;).
      </p>
    </div>
  );
}

interface PlanFormProps {
  mode: "create" | "edit";
  planId?: string;
  initialValues?: Partial<PlanFormValues>;
  /** Phase 2quater (1er août 2026) — évènements disponibles pour le sélecteur. */
  events?: { id: string; title: string }[];
  /**
   * 4 août 2026 (split plateforme/évènement) — offres plateforme actives
   * (eventId nul) proposées comme "offre plateforme associée" pour une
   * offre d'évènement. La propre offre en cours d'édition est exclue par
   * l'appelant (une offre ne peut pas se référencer elle-même).
   */
  platformPlans?: { id: string; name: string }[];
}

/** Phase 1 offres dynamiques — "offres créables librement par l'admin", toutes entreprise. */
export function PlanForm({
  mode,
  planId,
  initialValues,
  events = [],
  platformPlans = [],
}: PlanFormProps) {
  const router = useRouter();
  const [values, setValues] = React.useState<PlanFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function set<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const isEventOffer = values.eventId !== "";

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === "create" ? await createPlan(values) : await updatePlan(planId!, values);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/admin/plans");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[560px] rounded-lg border border-border bg-white p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-name">Nom de l&apos;offre *</Label>
          <Input
            id="plan-name"
            placeholder="ex. Executive pass"
            value={values.name}
            onChange={(e) => {
              const name = e.target.value;
              set("name", name);
              // Auto-suggestion du slug tant que l'admin ne l'a pas édité
              // lui-même (mode création uniquement — ne jamais réécrire un
              // slug existant en édition, des liens publics en dépendent).
              if (
                mode === "create" &&
                (values.slug === "" || values.slug === slugify(values.name))
              ) {
                set("slug", slugify(name));
              }
            }}
            maxLength={60}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-slug">
            Identifiant public (slug) * —{" "}
            <span className="font-normal text-text-muted">/inscription?offre=...</span>
          </Label>
          <Input
            id="plan-slug"
            placeholder="ex. executive-pass-2025"
            value={values.slug}
            onChange={(e) => set("slug", slugify(e.target.value))}
            maxLength={80}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-desc">Description</Label>
          <Textarea
            id="plan-desc"
            rows={3}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Évènement</Label>
          <Select
            value={values.eventId || "none"}
            onValueChange={(v) => set("eventId", v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucun — offre standard plateforme</SelectItem>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-text-muted">
            Rattachée à un évènement, cette offre inscrit automatiquement l&apos;acheteur (ou les
            collaborateurs déjà rattachés, pour une entreprise) à cet évènement une fois le paiement
            validé.
          </p>
        </div>

        {isEventOffer && (
          <div className="flex flex-col gap-1.5">
            <Label>Offre plateforme associée</Label>
            <Select
              value={values.linkedPlatformPlanId || "none"}
              onValueChange={(v) => set("linkedPlatformPlanId", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune</SelectItem>
                {platformPlans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">
              Les avantages (crédits, quotas de collaborateurs) accordés au paiement de cette offre
              d&apos;évènement viennent de l&apos;offre plateforme liée, pas de cette offre
              elle-même.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-price-eur">Prix (€)</Label>
            <Input
              id="plan-price-eur"
              type="number"
              min={0}
              placeholder="Laisser vide pour coter en Ar"
              value={values.priceEur ?? ""}
              onChange={(e) => set("priceEur", e.target.value ? Number(e.target.value) : null)}
              disabled={values.pricingMode === "TIERED_GROUP"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-price">
              {values.pricingMode === "TIERED_GROUP"
                ? "Prix (Ar) — non utilisé (voir les paliers ci-dessous)"
                : values.priceEur != null
                  ? "≈ Prix (Ar) — calculé au taux du jour"
                  : "Prix (Ar) *"}
            </Label>
            <Input
              id="plan-price"
              type="number"
              min={0}
              disabled={values.priceEur != null || values.pricingMode === "TIERED_GROUP"}
              value={values.priceAr}
              onChange={(e) => set("priceAr", Number(e.target.value))}
            />
            {values.priceEur != null && values.pricingMode !== "TIERED_GROUP" && (
              <p className="text-xs text-text-muted">
                Recalculé au taux du jour à chaque enregistrement — informatif, jamais utilisé pour
                valider un paiement.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-rank">Rang (comparaison d&apos;accès) *</Label>
          <Input
            id="plan-rank"
            type="number"
            min={1}
            value={values.rank}
            onChange={(e) => set("rank", Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Mode de tarification</Label>
          <Select
            value={values.pricingMode ?? "FIXED_BUNDLE"}
            onValueChange={(v) => set("pricingMode", v as PlanPricingMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FIXED_BUNDLE">Forfait fixe</SelectItem>
              <SelectItem value="PER_PARTICIPANT">Par participant (tarif dégressif)</SelectItem>
              <SelectItem value="TIERED_GROUP">Palier par groupe (dégressif)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {values.pricingMode === "TIERED_GROUP" && (
          <PriceBracketEditor
            brackets={values.priceBrackets}
            onChange={(brackets) => set("priceBrackets", brackets)}
          />
        )}

        {isEventOffer && values.pricingMode === "FIXED_BUNDLE" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-included-seats">Nombre de sièges inclus (cette édition)</Label>
            <Input
              id="plan-included-seats"
              type="number"
              min={1}
              value={values.includedSeats ?? ""}
              onChange={(e) => set("includedSeats", e.target.value ? Number(e.target.value) : null)}
            />
            <p className="text-xs text-text-muted">
              Réservé aux offres d&apos;évènement — pour une offre plateforme, le nombre max de
              collaborateurs ci-dessous suffit.
            </p>
          </div>
        )}

        {values.pricingMode === "PER_PARTICIPANT" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-min-participants">
              Seuil minimum de participants (prix dégressif)
            </Label>
            <Input
              id="plan-min-participants"
              type="number"
              min={1}
              value={values.minParticipants ?? ""}
              onChange={(e) =>
                set("minParticipants", e.target.value ? Number(e.target.value) : null)
              }
            />
            <p className="text-xs text-text-muted">
              Le prix (Ar) ci-dessus s&apos;applique par participant, pas au total.
            </p>
          </div>
        )}

        {!isEventOffer && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-max-members">Nombre max de collaborateurs</Label>
            <Input
              id="plan-max-members"
              type="number"
              min={1}
              value={values.maxTeamMembers ?? ""}
              onChange={(e) =>
                set("maxTeamMembers", e.target.value ? Number(e.target.value) : null)
              }
            />
            <p className="text-xs text-text-muted">
              Quota de collaborateurs de cet avantage plateforme — indépendant de toute édition
              d&apos;évènement.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-credits">Crédits Deal Room inclus</Label>
            <Input
              id="plan-credits"
              type="number"
              min={0}
              disabled={values.hasUnlimitedCredits}
              value={values.includedCredits}
              onChange={(e) => set("includedCredits", Number(e.target.value))}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-text-mid">
              <Checkbox
                checked={values.hasUnlimitedCredits}
                onCheckedChange={(c) => set("hasUnlimitedCredits", c === true)}
              />
              Crédits illimités
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-eligibility">Conditions d&apos;éligibilité</Label>
          <Textarea
            id="plan-eligibility"
            rows={2}
            value={values.eligibilityNote}
            onChange={(e) => set("eligibilityNote", e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-display-order">Ordre d&apos;affichage</Label>
            <Input
              id="plan-display-order"
              type="number"
              value={values.displayOrder}
              onChange={(e) => set("displayOrder", Number(e.target.value))}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-text-mid">
              <Checkbox
                checked={values.isActive}
                onCheckedChange={(c) => set("isActive", c === true)}
              />
              Offre active
            </label>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text-mid">
          <Checkbox
            checked={values.isSelfService}
            onCheckedChange={(c) => set("isSelfService", c === true)}
          />
          Parcours self-service (décocher pour le sponsoring — suivi admin uniquement, pas de
          paiement en ligne)
        </label>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSubmit} disabled={submitting} className="justify-center">
          {submitting ? "Enregistrement…" : mode === "create" ? "✓ Créer l'offre" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
