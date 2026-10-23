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

export interface PlanFormValues {
  name: string;
  slug: string;
  description: string;
  pricingMode: PlanPricingMode;
  priceAr: number;
  priceEur: number | null;
  minParticipants: number | null;
  maxTeamMembers: number | null;
  eligibilityNote: string;
  isActive: boolean;
  isSelfService: boolean;
  isUpsell: boolean;
  displayOrder: number;
  eventId: string;
  /** « 2026-12-31 » — dernier jour où l'offre peut être choisie et payée ; vide = sans limite. */
  availableUntil: string;
}

const EMPTY_VALUES: PlanFormValues = {
  name: "",
  slug: "",
  description: "",
  pricingMode: "FIXED_BUNDLE",
  priceAr: 0,
  priceEur: null,
  minParticipants: null,
  maxTeamMembers: null,
  eligibilityNote: "",
  isActive: true,
  isSelfService: true,
  isUpsell: false,
  displayOrder: 0,
  eventId: "",
  availableUntil: "",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface PlanFormProps {
  mode: "create" | "edit";
  planId?: string;
  initialValues?: Partial<PlanFormValues>;
  /** Événements auxquels une offre peut donner accès. */
  events: { id: string; title: string }[];
}

const NO_EVENT = "__none__";

/**
 * Formulaire d'offre, simplifié après l'audit du 22 septembre 2026
 * (`conception/12`) : une offre = une identité, une tarification, un nombre
 * de places, et l'événement auquel elle donne accès (réintroduit le
 * 8 octobre 2026). Les champs retirés (crédits Deal Room, rang d'accès,
 * sièges inclus, paliers dégressifs) ne
 * correspondaient plus à aucune règle de gestion active — voir
 * lib/validations/plan.ts pour le détail de ce qui reste en base.
 */
export function PlanForm({ mode, planId, initialValues, events }: PlanFormProps) {
  const router = useRouter();
  const [values, setValues] = React.useState<PlanFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function set<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const isGroupOffer = values.pricingMode === "PER_PARTICIPANT";

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
            placeholder="ex. Bronze"
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
            placeholder="ex. bronze"
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

        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-text-muted">
          Tarification
        </p>

        <div className="flex flex-col gap-1.5">
          <Label>Type d&apos;offre *</Label>
          <Select
            value={values.pricingMode}
            onValueChange={(v) => set("pricingMode", v as PlanPricingMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FIXED_BUNDLE">Forfait — prix fixe, places incluses</SelectItem>
              <SelectItem value="PER_PARTICIPANT">
                Groupement — prix par personne, à partir d&apos;un effectif
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-text-muted">
            {isGroupOffer
              ? "L'entreprise déclare son effectif à l'achat et paie le prix unitaire ci-dessous multiplié par cet effectif."
              : "L'entreprise achète l'offre telle quelle et obtient le nombre de places défini plus bas. Rien ne lui est demandé de plus au paiement."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-price-eur">
              {isGroupOffer ? "Prix par personne (€)" : "Prix (€)"}
            </Label>
            <Input
              id="plan-price-eur"
              type="number"
              min={0}
              placeholder="Laisser vide pour coter en Ar"
              value={values.priceEur ?? ""}
              onChange={(e) => set("priceEur", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-price">
              {values.priceEur != null ? "≈ Prix (Ar) — calculé au taux du jour" : "Prix (Ar) *"}
            </Label>
            <Input
              id="plan-price"
              type="number"
              min={0}
              disabled={values.priceEur != null}
              value={values.priceAr}
              onChange={(e) => set("priceAr", Number(e.target.value))}
            />
            {values.priceEur != null && (
              <p className="text-xs text-text-muted">
                Recalculé au taux du jour à chaque enregistrement — informatif, jamais utilisé pour
                valider un paiement.
              </p>
            )}
          </div>
        </div>

        {isGroupOffer ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-min-participants">Effectif minimum *</Label>
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
              En dessous de cet effectif, l&apos;offre n&apos;est pas proposée. Au-dessus, le prix
              par personne reste le même (ex. Groupement 10 : 750 € par personne dès 10 personnes,
              donc 12 personnes = 12 × 750 €).
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-max-members">Nombre de places incluses *</Label>
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
              Combien de participants l&apos;entreprise pourra inscrire à l&apos;évènement avec
              cette offre (ex. Bronze : 2).
            </p>
          </div>
        )}

        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-text-muted">
          Publication
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-event">Événement donnant accès</Label>
          <Select
            value={values.eventId || NO_EVENT}
            onValueChange={(v) => set("eventId", v === NO_EVENT ? "" : v)}
          >
            <SelectTrigger id="plan-event">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_EVENT}>Aucun événement</SelectItem>
              {events.map((ev) => (
                <SelectItem key={ev.id} value={ev.id}>
                  {ev.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-text-muted">
            Les participants désignés par le gérant seront inscrits à cet événement. Ses dates sont
            transmises à Evolia avec chaque inscription.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="plan-available-until">Disponible jusqu&apos;au (inclus)</Label>
          <Input
            id="plan-available-until"
            type="date"
            className="max-w-[220px]"
            value={values.availableUntil}
            onChange={(e) => set("availableUntil", e.target.value)}
          />
          <p className="text-xs text-text-muted">
            Après ce jour (fin de journée, heure de l&apos;événement), l&apos;offre n&apos;est plus
            proposée et ne peut plus être payée, même par une entreprise qui l&apos;avait déjà
            choisie. Vide = sans limite.
          </p>
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
