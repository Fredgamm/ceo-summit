"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod, PlanPricingMode } from "@prisma/client";

import { submitPaymentProof } from "@/app/actions/company-subscription";
import { computeDueAmount, meetsMinParticipants } from "@/lib/company-payment-amount";
import { formatAriary } from "@/lib/utils";
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

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "VIREMENT", label: "Virement bancaire" },
  { value: "CHEQUE", label: "Chèque" },
  { value: "CARTE_BANCAIRE", label: "Carte bancaire" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
];

/**
 * 3 septembre 2026 — carte bancaire et mobile money passeront par Evolia
 * (redirection, pas de preuve à uploader), mais ce pont n'est pas encore
 * construit côté Evolia (conception/11 §3, en attente de leur réponse) :
 * en attendant, ces deux méthodes restent sélectionnables mais ne mènent
 * à aucun parcours de paiement fonctionnel — seuls virement et chèque
 * (validation manuelle par preuve) sont opérationnels aujourd'hui.
 */
const EVOLIA_METHODS: PaymentMethod[] = ["CARTE_BANCAIRE", "MOBILE_MONEY"];

/**
 * 4 août 2026 (RG-04/RG-06, split plateforme/évènement) — pour une offre
 * `PER_PARTICIPANT`, le montant vient du nombre de participants **déclaré**
 * par l'entreprise (saisi ici, pas déduit du headcount réel — voir
 * lib/company-payment-amount.ts, même calcul rejoué côté serveur dans
 * submitPaymentProof, source de vérité). Pour `FIXED_BUNDLE`, le montant
 * est le forfait fixe de l'offre, aucune saisie requise.
 */
export function PaymentProofForm({
  companySubscriptionId,
  priceAr,
  minParticipants,
  pricingMode,
  includedSeats,
  headcount,
}: {
  companySubscriptionId: string;
  priceAr: number;
  minParticipants: number | null;
  pricingMode: PlanPricingMode | null;
  includedSeats: number | null;
  /** Nombre de collaborateurs déjà rattachés — utilisé seulement comme valeur de départ suggérée. */
  headcount: number;
}) {
  const router = useRouter();
  const isFixedBundle = pricingMode === "FIXED_BUNDLE";
  const [method, setMethod] = React.useState<PaymentMethod>("VIREMENT");
  const [comment, setComment] = React.useState("");
  const [declaredParticipants, setDeclaredParticipants] = React.useState(
    String(Math.max(headcount, minParticipants ?? 1))
  );
  const [proof, setProof] = React.useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const plan = { priceAr, minParticipants, pricingMode, includedSeats };
  const declaredCount = isFixedBundle ? 1 : Number(declaredParticipants) || 0;
  const meetsThreshold = meetsMinParticipants(plan, declaredCount);
  const amount = computeDueAmount(plan, declaredCount);
  const isEvoliaMethod = EVOLIA_METHODS.includes(method);

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
        ...(isFixedBundle ? {} : { declaredParticipants: declaredCount }),
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
      {!isFixedBundle && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="declared-participants">Nombre de participants prévu *</Label>
          <Input
            id="declared-participants"
            type="number"
            min={1}
            value={declaredParticipants}
            onChange={(e) => setDeclaredParticipants(e.target.value)}
          />
          <p className="text-xs text-text-muted">
            Vous pourrez inviter vos collaborateurs après paiement, à votre rythme, dans la limite
            de ce nombre.
          </p>
        </div>
      )}

      <div className="rounded-md border border-border bg-surface p-4">
        {isFixedBundle ? (
          <p className="text-sm text-text-mid">Forfait — {includedSeats ?? "?"} sièges inclus</p>
        ) : (
          <p className="text-sm text-text-mid">
            {declaredCount} participant(s) × {formatAriary(priceAr)}
          </p>
        )}
        <p className="text-lg font-bold text-navy">Montant dû : {formatAriary(amount)}</p>
        {!isFixedBundle && minParticipants && !meetsThreshold && (
          <p className="mt-1 text-xs text-red-600">
            Il manque {minParticipants - declaredCount} participant(s) déclaré(s) pour atteindre le
            seuil minimum de {minParticipants} de cette offre.
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
            {METHOD_OPTIONS.map((opt) => (
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
        disabled={submitting || uploading || !meetsThreshold || isEvoliaMethod}
        className="justify-center"
      >
        {submitting ? "Envoi…" : "Soumettre pour validation"}
      </Button>
    </form>
  );
}
