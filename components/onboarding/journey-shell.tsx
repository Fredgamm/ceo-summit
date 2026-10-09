import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface JourneyStep {
  key: string;
  label: string;
}

/** Parcours d'adhésion d'une entreprise : de l'offre à l'activation de l'accès. */
export const MEMBERSHIP_STEPS: JourneyStep[] = [
  { key: "offre", label: "Choisir l'offre" },
  { key: "compte", label: "Compte et entreprise" },
  { key: "paiement", label: "Paiement" },
  { key: "activation", label: "Activation de l'accès" },
];

/** Parcours d'un collaborateur invité par son gérant. */
export const INVITATION_STEPS: JourneyStep[] = [
  { key: "invitation", label: "Invitation reçue" },
  { key: "acces", label: "Créer votre accès" },
  { key: "plateforme", label: "Découvrir la plateforme" },
];

/**
 * Cadre commun du parcours d'adhésion (9 oct. 2026). Sur grand écran, un
 * panneau navy montre les étapes et la carte de membre, qui se complète au
 * fil du parcours ; sur mobile, une barre de progression compacte la remplace.
 */
export function JourneyShell({
  steps = MEMBERSHIP_STEPS,
  current,
  title,
  subtitle,
  card,
  backHref,
  headerAction,
  wide = false,
  panelLabel = "Votre adhésion",
  children,
}: {
  steps?: JourneyStep[];
  current: string;
  title: string;
  subtitle?: ReactNode;
  /** Carte de membre (ou résumé) affichée dans le panneau. */
  card?: ReactNode;
  backHref?: string;
  /** Action en haut à droite (déconnexion, lien de connexion…). */
  headerAction?: ReactNode;
  /** Contenu large (grille d'offres) plutôt qu'un formulaire. */
  wide?: boolean;
  /** Intitulé au-dessus des étapes, dans le panneau. */
  panelLabel?: string;
  children: ReactNode;
}) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === current)
  );

  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row">
      <aside className="hidden shrink-0 bg-navy text-white lg:block lg:w-[380px] xl:w-[420px]">
        <div className="flex flex-col px-10 py-10 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
          <Image
            src="/logo/ceo-summit-logo-dark.png"
            alt="CEO Summit"
            width={150}
            height={72}
            priority
          />
          <p className="mt-10 text-[11px] font-bold uppercase tracking-[0.16em] text-gold">
            {panelLabel}
          </p>
          <ol className="mt-5 flex flex-col">
            {steps.map((step, i) => {
              const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
              return (
                <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute left-[13px] top-7 h-[calc(100%-28px)] w-px",
                        state === "done" ? "bg-gold" : "bg-white/15"
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      state === "done" && "bg-gold text-navy",
                      state === "current" && "border-2 border-gold bg-navy text-gold",
                      state === "todo" && "border border-white/25 text-white/40"
                    )}
                  >
                    {state === "done" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "pt-1 text-sm",
                      state === "current" ? "font-semibold text-white" : "text-white/55"
                    )}
                    aria-current={state === "current" ? "step" : undefined}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>

          {card && <div className="mt-10">{card}</div>}

          <div className="mt-auto border-t border-white/10 pt-6 text-xs leading-relaxed text-white/50">
            Une question ?{" "}
            <a href="mailto:register@ceo-summit.mg" className="text-white/80 hover:text-white">
              register@ceo-summit.mg
            </a>{" "}
            ·{" "}
            <a href="tel:+261380913114" className="text-white/80 hover:text-white">
              038 09 131 14
            </a>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 lg:border-none lg:px-10 lg:pt-8">
          <div className="flex items-center gap-4">
            <Image
              src="/logo/ceo-summit-logo.png"
              alt="CEO Summit"
              width={84}
              height={40}
              className="lg:hidden"
            />
            {backHref && (
              <Link
                href={backHref}
                className="flex items-center gap-1.5 text-sm font-medium text-text-mid hover:text-navy"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2} />
                Retour
              </Link>
            )}
          </div>
          {headerAction}
        </header>

        <div
          className={cn(
            "mx-auto w-full px-5 pb-16 pt-8 lg:px-10 lg:pt-6",
            wide ? "max-w-[920px]" : "max-w-[600px]"
          )}
        >
          <div className="mb-8">
            <div className="mb-3 flex gap-1.5 lg:hidden" aria-hidden="true">
              {steps.map((s, i) => (
                <span
                  key={s.key}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    i <= currentIndex ? "bg-gold" : "bg-border"
                  )}
                />
              ))}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gold">
              Étape {currentIndex + 1} sur {steps.length}
              <span className="text-text-muted lg:hidden"> · {steps[currentIndex]?.label}</span>
            </p>
            <h1 className="mt-2 font-serif text-[28px] font-bold leading-tight text-navy sm:text-[32px]">
              {title}
            </h1>
            {subtitle && (
              <div className="mt-2 text-[15px] leading-relaxed text-text-mid">{subtitle}</div>
            )}
          </div>

          {card && <div className="mb-8 lg:hidden">{card}</div>}

          {children}
        </div>
      </main>
    </div>
  );
}
