"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PlanScope } from "@prisma/client";

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
  scope: PlanScope;
  priceAr: number;
  maxTeamMembers: number | null;
  minParticipants: number | null;
  includedCredits: number;
  hasUnlimitedCredits: boolean;
  rank: number;
  eligibilityNote: string;
  isActive: boolean;
  isSelfService: boolean;
  displayOrder: number;
}

const EMPTY_VALUES: PlanFormValues = {
  name: "",
  slug: "",
  description: "",
  scope: "INDIVIDUAL",
  priceAr: 0,
  maxTeamMembers: null,
  minParticipants: null,
  includedCredits: 0,
  hasUnlimitedCredits: false,
  rank: 1,
  eligibilityNote: "",
  isActive: true,
  isSelfService: true,
  displayOrder: 0,
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
}

/** Phase 1 offres dynamiques — "offres créables librement par l'admin". */
export function PlanForm({ mode, planId, initialValues }: PlanFormProps) {
  const router = useRouter();
  const [values, setValues] = React.useState<PlanFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function set<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

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
          <Label>Portée *</Label>
          <Select value={values.scope} onValueChange={(v) => set("scope", v as PlanScope)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="INDIVIDUAL">Individuelle</SelectItem>
              <SelectItem value="COMPANY">Entreprise</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-price">Prix (Ar) *</Label>
            <Input
              id="plan-price"
              type="number"
              min={0}
              value={values.priceAr}
              onChange={(e) => set("priceAr", Number(e.target.value))}
            />
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
        </div>

        {values.scope === "COMPANY" && (
          <div className="grid grid-cols-2 gap-4">
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
            </div>
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
