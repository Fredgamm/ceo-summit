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
import { PAYMENT_METHOD_OPTIONS, isEvoliaPaymentMethod } from "@/lib/payment-methods";
import {
  PAYMENT_PROOF_ACCEPT,
  PAYMENT_PROOF_HINT,
  uploadPaymentProof,
} from "@/lib/payment-proof-upload";
import { MAX_UPSELL_QUANTITY } from "@/lib/validations/company-payment";
import { unitPriceAr } from "@/lib/company-payment-amount";
import { arToEur, formatEuro, formatPlanPriceLive } from "@/lib/utils";
import { AriaryHint } from "@/components/ui/ariary-hint";
import { BankDetails } from "@/components/entreprise/bank-details";

/**
 * 22 septembre 2026 (`conception/12` §3.2) — achat d'un supplément de
 * places, en plus de l'offre déjà payée. Ne touche pas au parcours de
 * paiement initial (`PaymentProofForm`) : cette action-ci n'a aucun effet
 * sur l'accès en attendant la revue admin — l'entreprise garde son accès.
 */
export function UpsellPurchaseForm({
  companySubscriptionId,
  upsellPlans,
  liveEurToArRate,
  evoliaAvailable = true,
}: {
  companySubscriptionId: string;
  upsellPlans: Plan[];
  /** 23 oct. 2026 — Evolia pas encore activé : virement et chèque seulement. */
  evoliaAvailable?: boolean;
  /**
   * Rapport QA du 30 sept. 2026 (§10) — cours du jour EUR→Ar, fourni par la
   * page serveur. N'affecte jamais le montant réellement facturé.
   */
  liveEurToArRate: number;
}) {
  const router = useRouter();
  const [planId, setPlanId] = React.useState(upsellPlans[0]?.id ?? "");
  const [quantity, setQuantity] = React.useState("1");
  const [method, setMethod] = React.useState<PaymentMethod>("VIREMENT");
  const [comment, setComment] = React.useState("");
  const [proof, setProof] = React.useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const selectedPlan = upsellPlans.find((p) => p.id === planId);
  // `quantity` ne contient jamais que des chiffres (voir handleQuantityChange) —
  // vide tant que saisi, jamais négatif ni décimal, contrairement à un simple
  // Number(input.value) qui laisserait passer "1e5", "-3" ou "1.5".
  const declaredQuantity = quantity === "" ? 0 : parseInt(quantity, 10);
  const amount = selectedPlan ? unitPriceAr(selectedPlan, liveEurToArRate) * declaredQuantity : 0;
  // Rapport QA du 1er oct. 2026 (§1.3) — priceAr reste le seul montant
  // réellement facturé/validé, priceEur n'est qu'informatif (affiché en
  // principal ici comme demandé, l'Ariary passant en estimation).
  const amountEur =
    selectedPlan?.priceEur != null ? selectedPlan.priceEur * declaredQuantity : null;
  // Un supplément Groupement garde son seuil minimum même acheté en plus
  // d'un abonnement déjà actif (voir meetsMinParticipants côté serveur) — la
  // quantité doit donc toujours rester proportionnée à l'offre choisie.
  const minQuantity =
    selectedPlan?.pricingMode === "PER_PARTICIPANT" ? (selectedPlan.minParticipants ?? 1) : 1;
  const isQuantityTooLow = declaredQuantity > 0 && declaredQuantity < minQuantity;
  const isEvoliaMethod = isEvoliaPaymentMethod(method);

  // Changer d'offre change ce que "quantité" veut dire (places à l'unité vs.
  // effectif d'un lot) — on la recale sur le nouveau seuil au lieu de laisser
  // une quantité valide pour l'ancienne offre mais insuffisante pour la
  // nouvelle. Choix explicite de l'admin : ne déclenche jamais l'auto-switch
  // ci-dessous (sinon un choix manuel serait aussitôt écrasé par la quantité
  // déjà saisie — voir handleQuantityChange).
  function handlePlanChange(nextPlanId: string) {
    setPlanId(nextPlanId);
    const nextPlan = upsellPlans.find((p) => p.id === nextPlanId);
    const nextMin =
      nextPlan?.pricingMode === "PER_PARTICIPANT" ? (nextPlan.minParticipants ?? 1) : 1;
    setQuantity((prev) => {
      const parsed = prev === "" ? 0 : parseInt(prev, 10);
      return parsed < nextMin ? String(nextMin) : prev;
    });
  }

  /**
   * L'offre applicable dépend dynamiquement de la quantité saisie (repris de
   * la description initiale du besoin : Executive Pass à l'unité jusqu'à ce
   * que l'effectif atteigne le seuil d'un Groupement, qui prend alors le
   * relais — "dégressif" seulement à partir de ce seuil). Palier le plus
   * élevé atteint en priorité (ex. 30 personnes prend Groupement 30, pas
   * Groupement 10, même si les deux seuils sont franchis) ; en dessous de
   * tout seuil groupement, retombe sur une offre à l'unité.
   */
  function selectPlanForQuantity(qty: number): Plan | undefined {
    const groupPlansDesc = upsellPlans
      .filter((p) => p.pricingMode === "PER_PARTICIPANT" && p.minParticipants != null)
      .sort((a, b) => (b.minParticipants ?? 0) - (a.minParticipants ?? 0));
    const qualifying = groupPlansDesc.find((p) => qty >= (p.minParticipants ?? 1));
    if (qualifying) return qualifying;
    if (selectedPlan && selectedPlan.pricingMode !== "PER_PARTICIPANT") return selectedPlan;
    return upsellPlans.find((p) => p.pricingMode !== "PER_PARTICIPANT");
  }

  function handleQuantityChange(raw: string) {
    // Chiffres uniquement : bloque signe négatif, décimales et notation
    // scientifique dès la saisie plutôt que de les valider après coup.
    const digitsOnly = raw.replace(/[^0-9]/g, "");
    setQuantity(digitsOnly);
    const qty = digitsOnly === "" ? 0 : parseInt(digitsOnly, 10);
    if (qty > 0) {
      const nextPlan = selectPlanForQuantity(qty);
      if (nextPlan && nextPlan.id !== planId) setPlanId(nextPlan.id);
    }
  }

  function handleQuantityBlur() {
    setQuantity((prev) => {
      const parsed = prev === "" ? 0 : parseInt(prev, 10);
      return parsed < minQuantity ? String(minQuantity) : prev;
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadError(null);
    // Un fichier refusé remplace l'ancien : la soumission reste bloquée tant
    // qu'aucune preuve conforme n'est envoyée.
    setProof(null);
    setUploading(true);
    try {
      const result = await uploadPaymentProof(file);
      if (result.ok) setProof(result.proof);
      else setUploadError(result.error);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isEvoliaMethod && !proof) {
      setError("Ajoutez une preuve de paiement avant de soumettre.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await purchaseUpsellSeats(companySubscriptionId, {
        upsellPlanId: planId,
        quantity: declaredQuantity,
        method,
        proofFileKey: isEvoliaMethod ? "" : proof!.key,
        comment,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.data.redirectUrl) {
        // Carte / Mobile Money : paiement chez Evolia, qui nous le confirme ensuite.
        window.location.href = result.data.redirectUrl;
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
          <Select value={planId} onValueChange={handlePlanChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {upsellPlans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>
                  {plan.name} — {formatPlanPriceLive(plan, liveEurToArRate)}
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
            inputMode="numeric"
            min={minQuantity}
            max={MAX_UPSELL_QUANTITY}
            step={1}
            value={quantity}
            onChange={(e) => handleQuantityChange(e.target.value)}
            onBlur={handleQuantityBlur}
            className={isQuantityTooLow ? "border-red-500 focus-visible:ring-red-500" : undefined}
          />
          {isQuantityTooLow ? (
            <p className="text-xs text-red-600">
              Cette offre démarre à {minQuantity} place(s) — indiquez au moins ce nombre.
            </p>
          ) : (
            selectedPlan?.pricingMode === "PER_PARTICIPANT" && (
              <p className="text-xs text-text-muted">
                Cette offre démarre à {minQuantity} place(s).
              </p>
            )
          )}
        </div>
      </div>

      {upsellPlans.some((p) => p.pricingMode === "PER_PARTICIPANT") && (
        <p className="-mt-2 text-xs text-text-muted">
          L&apos;offre s&apos;ajuste automatiquement selon la quantité saisie — un effectif qui
          atteint le seuil d&apos;un groupement bascule sur son tarif par personne.
        </p>
      )}

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="text-sm text-text-mid">
          {declaredQuantity} ×{" "}
          {selectedPlan ? formatPlanPriceLive(selectedPlan, liveEurToArRate) : "—"}
        </p>
        <p className="text-lg font-bold text-navy">
          Montant dû : {formatEuro(amountEur ?? arToEur(amount, liveEurToArRate))}
        </p>
        <AriaryHint amountAr={amount} exact />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Mode de paiement *</Label>
        <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHOD_OPTIONS.filter(
              (opt) => evoliaAvailable || !isEvoliaPaymentMethod(opt.value)
            ).map((opt) => (
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
            Vous serez redirigé vers l&apos;interface de paiement sécurisée d&apos;Evolia,
            partenaire de paiement du CEO Summit Indian Ocean, afin de finaliser votre règlement par
            carte bancaire ou Mobile Money. Votre paiement sera confirmé automatiquement, sans
            démarche supplémentaire ni justificatif à transmettre.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <BankDetails method={method} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="upsell-proof">Preuve de paiement (image ou PDF) *</Label>
            <Input
              id="upsell-proof"
              type="file"
              accept={PAYMENT_PROOF_ACCEPT}
              onChange={handleFileChange}
              disabled={uploading}
            />
            {uploading ? (
              <p className="text-xs text-text-muted">Envoi en cours…</p>
            ) : proof ? (
              <p className="text-xs text-emerald-700">✓ {proof.name}</p>
            ) : uploadError ? (
              <p role="alert" className="text-sm text-red-600">
                {uploadError}
              </p>
            ) : (
              <p className="text-xs text-text-muted">
                {PAYMENT_PROOF_HINT} Fichier trop lourd ? Une capture d&apos;écran du reçu suffit.
              </p>
            )}
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
        </>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={
          submitting ||
          uploading ||
          declaredQuantity < minQuantity ||
          !selectedPlan ||
          (!isEvoliaMethod && !proof)
        }
        className="justify-center"
      >
        {submitting ? "Envoi…" : isEvoliaMethod ? "Payer avec Evolia" : "Acheter ces places"}
      </Button>
    </form>
  );
}
