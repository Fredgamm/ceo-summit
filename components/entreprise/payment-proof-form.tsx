"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod, Plan, PlanPricingMode } from "@prisma/client";

import { selectPlan, submitPaymentProof } from "@/app/actions/company-subscription";
import { computeDueAmount, meetsMinParticipants } from "@/lib/company-payment-amount";
import { PAYMENT_METHOD_OPTIONS, isEvoliaPaymentMethod } from "@/lib/payment-methods";
import { formatAriary, pluralize } from "@/lib/utils";
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

/**
 * 22 septembre 2026 (`conception/12`) — deux cas, et deux seulement :
 *
 * - **Forfait** (`FIXED_BUNDLE`, toutes les offres principales) : rien à
 *   déclarer, le montant est le prix de l'offre et le nombre de places est
 *   celui fixé par l'admin. L'entreprise choisira *qui* participe plus
 *   tard, depuis son espace — jamais au moment de payer.
 * - **Groupement** (`PER_PARTICIPANT`) : l'effectif est déclaré ici parce
 *   que le prix en dépend (prix unitaire × effectif, au-delà d'un seuil).
 *
 * Le même calcul est rejoué côté serveur dans `submitPaymentProof`, qui
 * reste la source de vérité.
 */
export function PaymentProofForm({
  companyId,
  companySubscriptionId,
  planId,
  priceAr,
  minParticipants,
  pricingMode,
  maxTeamMembers,
  groupPlans,
}: {
  companyId: string;
  companySubscriptionId: string;
  /** Offre actuellement souscrite — sert à détecter un changement d'offre. */
  planId: string;
  priceAr: number;
  minParticipants: number | null;
  pricingMode: PlanPricingMode | null;
  /** Nombre de places de l'offre — affiché, jamais saisi ici. */
  maxTeamMembers: number | null;
  /**
   * Offres Groupement actives du catalogue (`PER_PARTICIPANT`), effectif y
   * compris l'offre actuellement souscrite — sert à détecter, quand
   * l'effectif saisi atteint le seuil d'une autre offre Groupement, qu'il
   * faut y basculer automatiquement (voir handleDeclaredParticipantsBlur).
   */
  groupPlans: Plan[];
}) {
  const router = useRouter();
  const isGroupOffer = pricingMode === "PER_PARTICIPANT";
  const [method, setMethod] = React.useState<PaymentMethod>("VIREMENT");
  const [comment, setComment] = React.useState("");
  const [declaredParticipants, setDeclaredParticipants] = React.useState(
    String(minParticipants ?? 1)
  );
  const [proof, setProof] = React.useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [switchingPlan, setSwitchingPlan] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const plan = { priceAr, minParticipants, pricingMode };
  // `declaredParticipants` ne contient jamais que des chiffres (voir
  // handleDeclaredParticipantsChange) — jamais négatif ni décimal, contrairement
  // à un simple Number(input.value) qui laisserait passer "1e5", "-3" ou "1.5"
  // (même durcissement que UpsellPurchaseForm).
  const declaredCount = isGroupOffer
    ? declaredParticipants === ""
      ? 0
      : parseInt(declaredParticipants, 10)
    : 1;
  const meetsThreshold = meetsMinParticipants(plan, declaredCount);
  const amount = computeDueAmount(plan, declaredCount);
  const isEvoliaMethod = isEvoliaPaymentMethod(method);

  function handleDeclaredParticipantsChange(raw: string) {
    // Chiffres uniquement : bloque signe négatif, décimales et notation
    // scientifique dès la saisie plutôt que de les valider après coup.
    setDeclaredParticipants(raw.replace(/[^0-9]/g, ""));
  }

  /**
   * L'offre Groupement applicable dépend de l'effectif saisi (même logique
   * que UpsellPurchaseForm) : si l'effectif atteint le seuil d'une autre
   * offre Groupement du catalogue, on y bascule automatiquement plutôt que
   * de facturer cet effectif au tarif de l'offre choisie initialement.
   * Palier le plus élevé atteint en priorité (40 personnes prend l'offre à
   * 30 plutôt que celle à 10, si les deux seuils sont franchis).
   *
   * Contrairement à UpsellPurchaseForm, l'offre n'est pas un simple état
   * local ici : elle est déjà persistée (`CompanySubscription.planId`), donc
   * la bascule appelle `selectPlan` (même action que PlanPicker) puis
   * rafraîchit la page — sans effet secondaire sur une preuve déjà
   * uploadée, celle-ci ne devient un CompanyPayment qu'à la soumission.
   */
  async function handleDeclaredParticipantsBlur() {
    const parsed = declaredParticipants === "" ? 0 : parseInt(declaredParticipants, 10);

    const qualifying = groupPlans
      .filter((p) => p.minParticipants != null)
      .sort((a, b) => (b.minParticipants ?? 0) - (a.minParticipants ?? 0))
      .find((p) => parsed >= (p.minParticipants ?? 1));

    if (qualifying && qualifying.id !== planId) {
      setSwitchingPlan(true);
      try {
        const result = await selectPlan(companyId, qualifying.id);
        if (result.success) {
          router.refresh();
          return;
        }
        setError(result.error);
      } finally {
        setSwitchingPlan(false);
      }
    }

    setDeclaredParticipants((prev) => {
      const min = minParticipants ?? 1;
      return parsed < min ? String(min) : prev;
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/company/payment-proof", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Échec de l'upload.");
        return;
      }
      setProof(json.data);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!proof) {
      setError("Ajoutez une preuve de paiement avant de soumettre.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitPaymentProof(companySubscriptionId, {
        method,
        proofFileKey: proof.key,
        comment,
        ...(isGroupOffer ? { declaredParticipants: declaredCount } : {}),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Alert variant="success">
        <AlertDescription>
          Votre preuve de paiement a été transmise à l&apos;équipe CEO Summit — l&apos;accès de
          votre équipe s&apos;activera dès validation.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {isGroupOffer && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="declared-participants">Effectif de votre groupe *</Label>
          <Input
            id="declared-participants"
            type="number"
            inputMode="numeric"
            min={minParticipants ?? 1}
            step={1}
            value={declaredParticipants}
            onChange={(e) => handleDeclaredParticipantsChange(e.target.value)}
            onBlur={handleDeclaredParticipantsBlur}
            disabled={switchingPlan}
            className={!meetsThreshold ? "border-red-500 focus-visible:ring-red-500" : undefined}
          />
          <p className="text-xs text-text-muted">
            {switchingPlan
              ? "Ajustement de l'offre selon l'effectif saisi…"
              : "Cette offre se facture à la personne — indiquez combien de personnes vous engagez. Une autre offre Groupement peut se substituer automatiquement si l'effectif en atteint le seuil. Vous désignerez qui exactement depuis votre espace, après paiement."}
          </p>
        </div>
      )}

      <div className="rounded-md border border-border bg-surface p-4">
        {isGroupOffer ? (
          <p className="text-sm text-text-mid">
            {pluralize(declaredCount, "participant")} × {formatAriary(priceAr)}
          </p>
        ) : (
          <p className="text-sm text-text-mid">
            Forfait —{" "}
            {maxTeamMembers != null
              ? `${pluralize(maxTeamMembers, "participant")} inclus`
              : "? participant inclus"}
          </p>
        )}
        <p className="text-lg font-bold text-navy">Montant dû : {formatAriary(amount)}</p>
        {isGroupOffer && minParticipants && !meetsThreshold && (
          <p className="mt-1 text-xs text-red-600">
            Cette offre démarre à {pluralize(minParticipants, "participant")} — il en manque{" "}
            {minParticipants - declaredCount}.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Mode de paiement *</Label>
        <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isEvoliaMethod ? (
        <Alert variant="gold">
          <AlertDescription>
            Ce mode de paiement sera bientôt disponible — vous serez alors redirigé vers Evolia pour
            le finaliser, sans preuve à fournir. En attendant, choisissez virement bancaire ou
            chèque.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-proof">Preuve de paiement (image ou PDF) *</Label>
            <Input
              id="payment-proof"
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              disabled={uploading}
            />
            {uploading && <p className="text-xs text-text-muted">Envoi en cours…</p>}
            {proof && <p className="text-xs text-emerald-700">✓ {proof.name}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-comment">Commentaire (optionnel)</Label>
            <Textarea
              id="payment-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
            />
          </div>
        </>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={submitting || uploading || switchingPlan || !meetsThreshold || isEvoliaMethod}
        className="justify-center"
      >
        {submitting ? "Envoi…" : "Soumettre pour validation"}
      </Button>
    </form>
  );
}
