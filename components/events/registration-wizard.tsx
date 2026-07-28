"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { registerForEvent } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatAriary, formatDateFr } from "@/lib/utils";

const STEP_COUNT = 3;

interface RegistrationWizardProps {
  eventId: string;
  eventTitle: string;
  eventDate: Date;
  eventLocation: string;
  isOnline: boolean;
  price: number;
  viewer: { name: string; title: string; email: string; companyName: string | null };
}

type PaymentMethod = "VIREMENT" | "MOBILE_MONEY";

/**
 * E3-T03 — stepper 3 étapes (récapitulatif, paiement, confirmation). Un
 * événement gratuit/inclus n'a pas d'étape de choix de méthode — l'étape 2
 * devient juste une confirmation qu'aucun paiement n'est requis.
 */
export function RegistrationWizard({
  eventId,
  eventTitle,
  eventDate,
  eventLocation,
  isOnline,
  price,
  viewer,
}: RegistrationWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [method, setMethod] = React.useState<PaymentMethod>("MOBILE_MONEY");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  const isFree = price === 0;

  async function handleConfirm() {
    setError(null);
    setLoading(true);
    try {
      const result = await registerForEvent(eventId, isFree ? undefined : method);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setConfirmed(true);
      setStep(3);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[560px] rounded-lg border border-border bg-white p-8 shadow-card-md">
      <div className="mb-6 flex gap-1.5">
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-gold" : "bg-border"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h2 className="mb-1.5 text-xl font-bold text-navy">Récapitulatif</h2>
          <p className="mb-5 text-sm text-text-muted">
            Vérifiez les informations avant de continuer.
          </p>

          <div className="mb-4 rounded-md bg-surface p-4 text-sm">
            <p className="font-semibold text-navy">{eventTitle}</p>
            <p className="mt-1 text-text-mid">{formatDateFr(eventDate)}</p>
            <p className="text-text-mid">{isOnline ? "En ligne" : eventLocation}</p>
            <p className="mt-2 font-bold text-navy">{isFree ? "Gratuit" : formatAriary(price)}</p>
          </div>

          <div className="mb-6 rounded-md border border-border p-4 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase text-text-muted">Participant</p>
            <p className="font-medium text-navy">{viewer.name}</p>
            {viewer.title && (
              <p className="text-text-mid">
                {viewer.title}
                {viewer.companyName ? ` · ${viewer.companyName}` : ""}
              </p>
            )}
            <p className="text-text-mid">{viewer.email}</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)}>Continuer</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-1.5 text-xl font-bold text-navy">
            {isFree ? "Confirmation" : "Mode de paiement"}
          </h2>

          {isFree ? (
            <p className="mb-6 text-sm text-text-muted">
              Cet événement est gratuit / inclus dans votre membership — aucun paiement n&apos;est
              requis.
            </p>
          ) : (
            <div className="mb-6 flex flex-col gap-3">
              {[
                {
                  value: "MOBILE_MONEY" as const,
                  label: "Mobile Money",
                  desc: "MVola, Orange Money — paiement mobile instantané",
                },
                {
                  value: "VIREMENT" as const,
                  label: "Virement bancaire",
                  desc: "RIB fourni après inscription · validation manuelle",
                },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-4 ${
                    method === opt.value ? "border-navy bg-surface" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    className="mt-1"
                    checked={method === opt.value}
                    onChange={() => setMethod(opt.value)}
                  />
                  <div>
                    <p className="text-sm font-semibold text-navy">{opt.label}</p>
                    <p className="text-xs text-text-muted">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={loading}>
              Retour
            </Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading
                ? "Traitement…"
                : isFree
                  ? "Confirmer mon inscription"
                  : "Confirmer et s'inscrire"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && confirmed && (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">
            ✓
          </div>
          <h2 className="mb-1.5 text-xl font-bold text-navy">Inscription confirmée</h2>
          <p className="mb-6 text-sm leading-relaxed text-text-muted">
            Un email de confirmation avec votre badge digital vient de vous être envoyé.
            {!isFree &&
              method === "VIREMENT" &&
              " Votre badge sera activé dès validation du virement par l'équipe CEO Summit."}
          </p>
          <Button asChild className="w-full justify-center">
            <Link href={`/evenements/${eventId}`}>Retour à l&apos;événement</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
