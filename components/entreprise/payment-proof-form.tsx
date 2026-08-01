"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@prisma/client";

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
 * Phase 2ter (1er août 2026) — le montant n'est plus saisi : calculé à
 * partir du prix par participant de l'offre et du nombre réel de
 * collaborateurs (voir lib/company-payment-amount.ts, appliqué de la même
 * façon côté serveur dans submitPaymentProof — ce composant n'affiche
 * qu'un aperçu, la source de vérité reste le calcul serveur).
 */
export function PaymentProofForm({
  companySubscriptionId,
  pricePerParticipant,
  minParticipants,
  headcount,
}: {
  companySubscriptionId: string;
  pricePerParticipant: number;
  minParticipants: number | null;
  headcount: number;
}) {
  const router = useRouter();
  const [method, setMethod] = React.useState<PaymentMethod>("VIREMENT");
  const [comment, setComment] = React.useState("");
  const [proof, setProof] = React.useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const plan = { priceAr: pricePerParticipant, minParticipants };
  const meetsThreshold = meetsMinParticipants(plan, headcount);
  const amount = computeDueAmount(plan, headcount);

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
      <div className="rounded-md border border-border bg-surface p-4">
        <p className="text-sm text-text-mid">
          {headcount} participant(s) × {formatAriary(pricePerParticipant)}
        </p>
        <p className="text-lg font-bold text-navy">Montant dû : {formatAriary(amount)}</p>
        {minParticipants && !meetsThreshold && (
          <p className="mt-1 text-xs text-red-600">
            Il manque {minParticipants - headcount} collaborateur(s) pour atteindre le seuil minimum
            de {minParticipants} de cette offre — invitez-les avant de soumettre.
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

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={submitting || uploading || !meetsThreshold}
        className="justify-center"
      >
        {submitting ? "Envoi…" : "Soumettre pour validation"}
      </Button>
    </form>
  );
}
