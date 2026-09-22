"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod, Plan } from "@prisma/client";

import { purchaseUpsellSeats } from "@/app/actions/company-subscription";
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
import { formatAriary, formatPlanPrice } from "@/lib/utils";

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "VIREMENT", label: "Virement bancaire" },
  { value: "CHEQUE", label: "Chèque" },
];

/**
 * 22 septembre 2026 (`conception/12` §3.2) — achat d'un supplément de
 * places, en plus de l'offre déjà payée. Ne touche pas au parcours de
 * paiement initial (`PaymentProofForm`) : cette action-ci n'a aucun effet
 * sur l'accès en attendant la revue admin — l'entreprise garde son accès.
 */
export function UpsellPurchaseForm({
  companySubscriptionId,
  upsellPlans,
  seatsNeeded = 1,
}: {
  companySubscriptionId: string;
  upsellPlans: Plan[];
  /** Nombre de places manquantes à cet instant — présélectionné comme quantité de départ. */
  seatsNeeded?: number;
}) {
  const router = useRouter();
  const [planId, setPlanId] = React.useState(upsellPlans[0]?.id ?? "");
  const [quantity, setQuantity] = React.useState(String(Math.max(seatsNeeded, 1)));
  const [method, setMethod] = React.useState<PaymentMethod>("VIREMENT");
  const [comment, setComment] = React.useState("");
  const [proof, setProof] = React.useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const selectedPlan = upsellPlans.find((p) => p.id === planId);
  const declaredQuantity = Number(quantity) || 0;
  const amount = selectedPlan ? selectedPlan.priceAr * declaredQuantity : 0;

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
      const result = await purchaseUpsellSeats(companySubscriptionId, {
        upsellPlanId: planId,
        quantity: declaredQuantity,
        method,
        proofFileKey: proof.key,
        comment,
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

  if (upsellPlans.length === 0) return null;

  if (submitted) {
    return (
      <Alert variant="success">
        <AlertDescription>
          Votre achat de places supplémentaires a été transmis à l&apos;équipe CEO Summit — les
          nouvelles places seront disponibles dès validation.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Offre</Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {upsellPlans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name} — {formatPlanPrice(plan)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="upsell-quantity">Quantité</Label>
          <Input
            id="upsell-quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="text-sm text-text-mid">
          {declaredQuantity} × {selectedPlan ? formatPlanPrice(selectedPlan) : "—"}
        </p>
        <p className="text-lg font-bold text-navy">Montant dû : {formatAriary(amount)}</p>
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upsell-proof">Preuve de paiement (image ou PDF) *</Label>
        <Input
          id="upsell-proof"
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {uploading && <p className="text-xs text-text-muted">Envoi en cours…</p>}
        {proof && <p className="text-xs text-emerald-700">✓ {proof.name}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upsell-comment">Commentaire (optionnel)</Label>
        <Textarea
          id="upsell-comment"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={submitting || uploading || declaredQuantity < 1}
        className="justify-center"
      >
        {submitting ? "Envoi…" : "Acheter ces places"}
      </Button>
    </form>
  );
}
