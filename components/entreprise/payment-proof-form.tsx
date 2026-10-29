"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod, Plan, PlanPricingMode } from "@prisma/client";

import { selectPlan, submitPaymentProof } from "@/app/actions/company-subscription";
import { computeDueAmount, meetsMinParticipants } from "@/lib/company-payment-amount";
import { isEvoliaPaymentMethod } from "@/lib/payment-methods";
import {
  PAYMENT_PROOF_ACCEPT,
  PAYMENT_PROOF_HINT,
  uploadPaymentProof,
} from "@/lib/payment-proof-upload";
import { arToEur, cn, formatEuro, planPriceEur, pluralize } from "@/lib/utils";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Landmark,
  Lock,
  Smartphone,
  UploadCloud,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AriaryHint } from "@/components/ui/ariary-hint";
import { BankDetails } from "@/components/entreprise/bank-details";

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
  priceEur,
  minParticipants,
  pricingMode,
  maxTeamMembers,
  groupPlans,
  initialDeclaredParticipants,
  evoliaAvailable = true,
  liveEurToArRate,
}: {
  companyId: string;
  companySubscriptionId: string;
  /** Offre actuellement souscrite — sert à détecter un changement d'offre. */
  planId: string;
  priceAr: number;
  /**
   * Rapport QA du 1er oct. 2026 (§1.3) — prix officiel en € de l'offre, s'il
   * en a un. `priceAr` reste la seule valeur réellement facturée/validée
   * (lib/company-payment-amount.ts) — `priceEur` n'est qu'informatif,
   * affiché en principal ici comme demandé, l'Ariary passant en estimation.
   */
  priceEur: number | null;
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
  /** Effectif déjà déclaré (paiement précédent refusé ou annulé), repris comme valeur de départ. */
  initialDeclaredParticipants?: number | null;
  /**
   * 23 oct. 2026 — Evolia activé : carte et Mobile Money proposés. Sinon,
   * virement et chèque seulement (rien ne part vers Evolia avant l'activation).
   */
  evoliaAvailable?: boolean;
  /** Cours du jour, pour afficher en euros une offre sans prix en €. */
  liveEurToArRate: number;
}) {
  const router = useRouter();
  const isGroupOffer = pricingMode === "PER_PARTICIPANT";
  const [method, setMethod] = React.useState<PaymentMethod>("VIREMENT");
  const [comment, setComment] = React.useState("");
  const [declaredParticipants, setDeclaredParticipants] = React.useState(
    String(initialDeclaredParticipants ?? minParticipants ?? 1)
  );
  const [proof, setProof] = React.useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
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
  const amount = computeDueAmount({ ...plan, priceEur }, declaredCount, liveEurToArRate);
  const amountEur = priceEur != null ? (isGroupOffer ? priceEur * declaredCount : priceEur) : null;
  const isEvoliaMethod = isEvoliaPaymentMethod(method);

  // Retour de test du 21 oct. 2026 — dès que l'effectif saisi atteint le
  // seuil d'une offre de groupe plus avantageuse, on le dit pendant la
  // saisie (la bascule automatique, elle, se fait en quittant le champ).
  const betterGroupPlans = isGroupOffer
    ? groupPlans
        .filter(
          (p) =>
            p.id !== planId &&
            p.minParticipants != null &&
            p.minParticipants > (minParticipants ?? 0)
        )
        .sort((a, b) => (a.minParticipants ?? 0) - (b.minParticipants ?? 0))
    : [];
  const groupThreshold = betterGroupPlans[0]?.minParticipants ?? null;
  const suggestGroupPlan =
    !switchingPlan && groupThreshold != null && declaredCount >= groupThreshold;

  function showOtherPlans() {
    const details = document.getElementById("changer-offre");
    if (details instanceof HTMLDetailsElement) {
      details.open = true;
      details.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

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
      const result = await submitPaymentProof(companySubscriptionId, {
        method,
        proofFileKey: isEvoliaMethod ? "" : proof!.key,
        comment,
        ...(isGroupOffer ? { declaredParticipants: declaredCount } : {}),
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

  if (submitted) {
    return (
      <div className="flex gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
        <div>
          <p className="font-semibold text-navy">Preuve de paiement envoyée</p>
          <p className="mt-1 text-sm text-text-mid">
            L&apos;équipe CEO Summit la vérifie, puis l&apos;accès de votre équipe s&apos;active :
            vous recevrez un e-mail de confirmation.
          </p>
        </div>
      </div>
    );
  }

  const amountEurDisplay = amountEur ?? arToEur(amount, liveEurToArRate);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>
      <section>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.1em] text-navy">
          Votre commande
        </h2>

        {isGroupOffer && (
          <div className="mb-4 flex flex-col gap-1.5">
            <Label htmlFor="declared-participants">Nombre de participants</Label>
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
              className={cn(
                "max-w-[160px]",
                !meetsThreshold && "border-red-500 focus-visible:ring-red-500"
              )}
            />
            {suggestGroupPlan ? (
              <div className="rounded-md border border-gold-light bg-gold-pale px-3 py-2.5 text-sm text-text-mid">
                Vous avez sélectionné {pluralize(declaredCount, "participant")} : l&apos;offre de
                groupe est plus avantageuse pour votre entreprise. Basculez vers l&apos;offre{" "}
                {betterGroupPlans.map((p, i) => (
                  <React.Fragment key={p.id}>
                    {i > 0 && " ou "}
                    <strong className="font-semibold text-navy">
                      {p.name.replace(/\*+/g, "").trim()}
                    </strong>
                  </React.Fragment>
                ))}{" "}
                (
                <button
                  type="button"
                  onClick={showOtherPlans}
                  className="font-semibold text-navy-mid underline underline-offset-2"
                >
                  voir les offres
                </button>
                ). Vous désignerez les participants après le paiement.
              </div>
            ) : (
              <p className="text-xs text-text-muted">
                {switchingPlan
                  ? "Ajustement de l'offre selon l'effectif saisi…"
                  : "Indiquez le nombre de personnes de votre entreprise qui participeront. Vous désignerez les participants après le paiement."}
              </p>
            )}
          </div>
        )}

        <dl className="rounded-lg border border-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-text-mid">
              {isGroupOffer
                ? `${pluralize(declaredCount, "participant")} × ${formatEuro(planPriceEur({ priceAr, priceEur }, liveEurToArRate))}`
                : maxTeamMembers != null
                  ? `Forfait · ${pluralize(maxTeamMembers, "participant")} inclus`
                  : "Forfait entreprise"}
            </dt>
            <dd className="tabular-nums text-navy">{formatEuro(amountEurDisplay)}</dd>
          </div>
          <div className="flex items-end justify-between gap-4 border-t border-dashed border-border bg-surface px-4 py-4">
            <dt className="text-sm font-semibold text-navy">Montant dû</dt>
            <dd className="text-right">
              <span className="block text-2xl font-bold tabular-nums text-navy">
                {formatEuro(amountEurDisplay)}
              </span>
              <AriaryHint amountAr={amount} exact />
            </dd>
          </div>
        </dl>
        {isGroupOffer && minParticipants && !meetsThreshold && (
          <p className="mt-2 text-xs text-red-600">
            Cette offre démarre à {pluralize(minParticipants, "participant")} — il en manque{" "}
            {minParticipants - declaredCount}.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.1em] text-navy">
          Mode de paiement
        </h2>
        <div
          role="radiogroup"
          aria-label="Mode de paiement"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {METHOD_TILES.filter((tile) => evoliaAvailable || !isEvoliaPaymentMethod(tile.value)).map(
            (tile) => {
              const selected = method === tile.value;
              return (
                <button
                  key={tile.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setMethod(tile.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-4 text-left transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2",
                    selected
                      ? "border-navy bg-navy-light/40 ring-1 ring-navy"
                      : "border-border hover:border-navy-mid"
                  )}
                >
                  <tile.icon
                    className={cn(
                      "mt-0.5 h-5 w-5 shrink-0",
                      selected ? "text-navy" : "text-text-muted"
                    )}
                  />
                  <span>
                    <span className="block font-semibold text-navy">{tile.label}</span>
                    <span className="mt-0.5 block text-xs text-text-muted">{tile.hint}</span>
                  </span>
                </button>
              );
            }
          )}
        </div>
        <BankDetails method={method} className="mt-3" />
      </section>

      {isEvoliaMethod ? (
        <div className="flex gap-3 rounded-lg border border-gold-light bg-gold-pale p-4 text-sm text-text-mid">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p>
            Vous serez redirigé vers l&apos;interface de paiement sécurisée d&apos;Evolia,
            partenaire de paiement du CEO Summit Indian Ocean, afin de finaliser votre règlement par
            carte bancaire ou Mobile Money. Votre paiement sera confirmé automatiquement, sans
            démarche supplémentaire ni justificatif à transmettre.
          </p>
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-navy">
            Preuve de paiement
          </h2>
          <label
            htmlFor="payment-proof"
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition",
              proof
                ? "border-emerald-300 bg-emerald-50"
                : uploadError
                  ? "border-red-300 bg-red-50"
                  : "border-border hover:border-navy-mid"
            )}
          >
            {proof ? (
              <>
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <span className="text-sm font-semibold text-navy">{proof.name}</span>
                <span className="text-xs text-text-muted">Cliquez pour remplacer le fichier</span>
              </>
            ) : (
              <>
                <UploadCloud className="h-6 w-6 text-text-muted" />
                <span className="text-sm font-semibold text-navy">
                  {uploading
                    ? "Envoi en cours…"
                    : uploadError
                      ? "Choisir un autre fichier"
                      : "Ajouter le bordereau, l'ordre de virement ou le reçu"}
                </span>
                <span className="text-xs text-text-muted">{PAYMENT_PROOF_HINT}</span>
              </>
            )}
            <input
              id="payment-proof"
              type="file"
              accept={PAYMENT_PROOF_ACCEPT}
              onChange={handleFileChange}
              disabled={uploading}
              aria-describedby="payment-proof-help"
              className="sr-only"
            />
          </label>
          {uploadError ? (
            <p id="payment-proof-help" role="alert" className="-mt-2 text-sm text-red-600">
              {uploadError}
            </p>
          ) : (
            !proof && (
              <p id="payment-proof-help" className="-mt-2 text-xs text-text-muted">
                Fichier trop lourd ? Une capture d&apos;écran du reçu ou de l&apos;ordre de virement
                suffit. Les photos iPhone (HEIC) ne sont pas acceptées.
              </p>
            )
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-comment">Commentaire (facultatif)</Label>
            <Textarea
              id="payment-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              placeholder="Référence du virement, date d'émission du chèque…"
            />
          </div>
        </section>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={
          submitting || uploading || switchingPlan || !meetsThreshold || (!isEvoliaMethod && !proof)
        }
        className="w-full justify-center gap-2"
      >
        {submitting ? (
          "Envoi…"
        ) : isEvoliaMethod ? (
          <>
            Payer {formatEuro(amountEurDisplay)} avec Evolia <ArrowRight className="h-4 w-4" />
          </>
        ) : (
          "Envoyer la preuve de paiement"
        )}
      </Button>
      {!isEvoliaMethod && !proof && !uploading && (
        <p className="-mt-6 text-center text-xs text-text-muted">
          Ajoutez une preuve de paiement conforme pour pouvoir l&apos;envoyer.
        </p>
      )}
    </form>
  );
}

const METHOD_TILES: {
  value: PaymentMethod;
  label: string;
  hint: string;
  icon: typeof CreditCard;
}[] = [
  {
    value: "CARTE_BANCAIRE",
    label: "Carte bancaire",
    hint: "Paiement immédiat, via Evolia",
    icon: CreditCard,
  },
  {
    value: "MOBILE_MONEY",
    label: "Mobile Money",
    hint: "Paiement immédiat, via Evolia",
    icon: Smartphone,
  },
  {
    value: "VIREMENT",
    label: "Virement bancaire",
    hint: "Joindre la preuve de virement",
    icon: Landmark,
  },
  { value: "CHEQUE", label: "Chèque", hint: "Joindre la photo du chèque", icon: FileCheck2 },
];
