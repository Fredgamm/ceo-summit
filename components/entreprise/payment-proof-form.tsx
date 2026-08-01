"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@prisma/client";

import { submitPaymentProof } from "@/app/actions/company-subscription";
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

export function PaymentProofForm({
  companySubscriptionId,
  suggestedAmount,
}: {
  companySubscriptionId: string;
  suggestedAmount: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = React.useState(String(suggestedAmount));
  const [method, setMethod] = React.useState<PaymentMethod>("VIREMENT");
  const [comment, setComment] = React.useState("");
  const [proof, setProof] = React.useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

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
        amount: Number(amount),
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
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payment-amount">Montant payé (Ar) *</Label>
          <Input
            id="payment-amount"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
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

      <Button type="submit" disabled={submitting || uploading} className="justify-center">
        {submitting ? "Envoi…" : "Soumettre pour validation"}
      </Button>
    </form>
  );
}
