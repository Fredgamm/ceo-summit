"use client";

import * as React from "react";
import type { Plan } from "@prisma/client";

import { CompanyForm } from "@/components/entreprise/company-form";
import { formatAriary } from "@/lib/utils";

const STEP_COUNT = 2;

/**
 * Parcours revu (1er août 2026) — l'offre est choisie avant l'entreprise
 * (cas d'usage retenu) ; rien n'est écrit en base tant que l'étape 2 n'est
 * pas soumise (voir app/actions/company.ts::createCompany, qui crée
 * Company + CompanySubscription ensemble). L'étape 1 ne fait que garder le
 * choix en état local, comme components/onboarding/onboarding-wizard.tsx
 * garde son step index.
 */
export function CompanyOnboardingWizard({
  plans,
  initialPlanId,
}: {
  plans: Plan[];
  /**
   * Phase 2ter (1er août 2026) — offre choisie sur le site public
   * (`User.intendedPlanId`), pré-sélectionnée mais pas imposée : l'étape 1
   * reste affichée pour confirmation, pas sautée automatiquement.
   */
  initialPlanId?: string | null;
}) {
  const [step, setStep] = React.useState(1);
  const [planId, setPlanId] = React.useState<string | null>(initialPlanId ?? null);

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-6 flex items-center gap-2">
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-gold" : "bg-border"}`}
          />
        ))}
      </div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Étape {step} sur {STEP_COUNT}
      </p>

      {step === 1 && (
        <div>
          <h1 className="mb-1 text-xl font-bold text-navy">Choisissez votre offre</h1>
          <p className="mb-4 text-sm text-text-muted">
            L&apos;offre détermine le nombre de collaborateurs autorisés et les crédits Deal Room
            inclus — vous renseignerez votre entreprise à l&apos;étape suivante.
          </p>

          {plans.length === 0 ? (
            <p className="text-sm text-text-muted">
              Aucune offre entreprise disponible pour l&apos;instant.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setPlanId(plan.id)}
                  className={`flex flex-col gap-2 rounded-lg border-2 bg-white p-5 text-left transition-colors ${
                    planId === plan.id ? "border-navy" : "border-border"
                  }`}
                >
                  <p className="text-base font-bold text-navy">{plan.name}</p>
                  {plan.description && <p className="text-sm text-text-mid">{plan.description}</p>}
                  <p className="mt-1 text-lg font-bold text-navy">
                    {formatAriary(plan.priceAr)} / participant / an
                  </p>
                  <ul className="flex flex-col gap-1 text-xs text-text-muted">
                    {plan.minParticipants && (
                      <li>
                        Réservé aux entreprises inscrivant ≥ {plan.minParticipants} participants
                      </li>
                    )}
                    {plan.maxTeamMembers && (
                      <li>Jusqu&apos;à {plan.maxTeamMembers} collaborateurs</li>
                    )}
                    <li>
                      {plan.hasUnlimitedCredits
                        ? "Crédits Deal Room illimités"
                        : `${plan.includedCredits} crédits Deal Room inclus par participant`}
                    </li>
                  </ul>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={!planId}
            onClick={() => setStep(2)}
            className="mt-5 w-full rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            Suivant →
          </button>
        </div>
      )}

      {step === 2 && planId && (
        <div>
          <h1 className="mb-1 text-xl font-bold text-navy">Votre entreprise</h1>
          <p className="mb-4 text-sm text-text-muted">
            Vous deviendrez l&apos;administrateur de cette fiche — vous pourrez inviter des
            collaborateurs juste après.
          </p>
          <CompanyForm mode="create" planId={planId} onBack={() => setStep(1)} />
        </div>
      )}
    </div>
  );
}
