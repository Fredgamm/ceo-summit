"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  finishOnboarding,
  saveOnboardingProfileStep,
  saveOnboardingSectorsStep,
} from "@/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ReferentialSearchButton } from "@/components/referentials/referential-search-button";
import { visibleReferentialOptions } from "@/lib/referential-options";

const STEP_COUNT = 4;

interface OnboardingWizardProps {
  firstName: string;
  initialTitle: string;
  initialBio: string;
  initialSectors: string[];
  /** Référentiel admin-éditable (E8-T11, 5 août 2026) — fourni par la page serveur parente. */
  availableSectors: string[];
}

/**
 * 4-step tutorial (US-010): each screen skippable, "Terminer" only required
 * on the last step. Step 1 has nothing to save; steps 2 and 3 persist to
 * the User row as soon as "Suivant" is clicked (see onboarding.ts).
 */
export function OnboardingWizard({
  firstName,
  initialTitle,
  initialBio,
  initialSectors,
  availableSectors,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [title, setTitle] = React.useState(initialTitle);
  const [bio, setBio] = React.useState(initialBio);
  const [sectors, setSectors] = React.useState<string[]>(initialSectors);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  function toggleSector(sector: string) {
    setSectors((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]
    );
  }

  async function goToDashboard() {
    setLoading(true);
    try {
      await finishOnboarding();
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleNext() {
    setError(null);
    setLoading(true);
    try {
      if (step === 2) {
        const result = await saveOnboardingProfileStep(title, bio);
        if (!result.success) {
          setError(result.error);
          return;
        }
      }
      if (step === 3) {
        const result = await saveOnboardingSectorsStep(sectors);
        if (!result.success) {
          setError(result.error);
          return;
        }
      }
      setStep((s) => Math.min(s + 1, STEP_COUNT));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[560px] rounded-lg border border-border bg-white p-8 shadow-card-md">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-1.5">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-8 rounded-full ${i + 1 <= step ? "bg-gold" : "bg-border"}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={goToDashboard}
          disabled={loading}
          className="text-xs font-medium text-text-muted hover:text-navy"
        >
          Passer
        </button>
      </div>

      {step === 1 && <WelcomeStep firstName={firstName} />}
      {step === 2 && (
        <ProfileStep title={title} bio={bio} onTitleChange={setTitle} onBioChange={setBio} />
      )}
      {step === 3 && (
        <SectorsStep selected={sectors} onToggle={toggleSector} available={availableSectors} />
      )}
      {step === 4 && <ClosingStep />}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-8 flex justify-between">
        {step > 1 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={loading}>
            Retour
          </Button>
        ) : (
          <span />
        )}

        {step < STEP_COUNT ? (
          <Button onClick={handleNext} disabled={loading}>
            {loading ? "Enregistrement…" : "Suivant"}
          </Button>
        ) : (
          <Button onClick={goToDashboard} disabled={loading}>
            {loading ? "Enregistrement…" : "Accéder à mon tableau de bord"}
          </Button>
        )}
      </div>
    </div>
  );
}

function WelcomeStep({ firstName }: { firstName: string }) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-navy">
        Bienvenue dans le Cercle des Décideurs, {firstName}.
      </h1>
      <p className="mb-6 text-sm leading-relaxed text-text-muted">
        Votre accès au CEO Summit est actif. Trois piliers sont désormais à votre disposition.
      </p>
      <div className="flex flex-col gap-4">
        <Pillar
          title="Cercle des Décideurs"
          description="L'annuaire des dirigeants membres du CEO Summit et leurs entreprises."
        />
        <Pillar
          title="Le Deal Room"
          description="Des opportunités B2B exclusives entre membres — partenariats, investissements, appels d'offres."
        />
        <Pillar
          title="CEO Summit Intelligence"
          description="Contenus et rapports premium réservés aux membres du cercle."
        />
      </div>
    </div>
  );
}

function Pillar({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex gap-3 rounded-md bg-surface p-3">
      <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
      <div>
        <p className="text-sm font-semibold text-navy">{title}</p>
        <p className="text-xs leading-relaxed text-text-muted">{description}</p>
      </div>
    </div>
  );
}

function ProfileStep({
  title,
  bio,
  onTitleChange,
  onBioChange,
}: {
  title: string;
  bio: string;
  onTitleChange: (v: string) => void;
  onBioChange: (v: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-1.5 text-xl font-bold text-navy">Votre profil</h2>
      <p className="mb-5 text-sm text-text-muted">
        Une photo et une bio complètes augmentent la confiance des autres membres — vous pourrez
        ajouter une photo depuis votre profil.
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-title">Titre / Poste</Label>
          <Input
            id="onboarding-title"
            placeholder="ex: Directrice Générale"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-bio">Bio courte</Label>
          <Textarea
            id="onboarding-bio"
            placeholder="Quelques lignes sur votre parcours…"
            value={bio}
            onChange={(e) => onBioChange(e.target.value)}
            maxLength={750}
          />
          <p className="text-right text-xs text-text-muted">{bio.length}/750</p>
        </div>
      </div>
    </div>
  );
}

function SectorsStep({
  selected,
  onToggle,
  available,
}: {
  selected: string[];
  onToggle: (sector: string) => void;
  available: string[];
}) {
  return (
    <div>
      <h2 className="mb-1.5 text-xl font-bold text-navy">Secteurs d&apos;intérêt</h2>
      <p className="mb-5 text-sm text-text-muted">
        Sélectionnez les secteurs qui vous intéressent — cela affine ce qui vous est montré dans le
        Deal Room et le Catalogue.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {visibleReferentialOptions(available, selected).map((sector) => (
          <label
            key={sector}
            className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm"
          >
            <Checkbox
              checked={selected.includes(sector)}
              onCheckedChange={() => onToggle(sector)}
            />
            {sector}
          </label>
        ))}
        <ReferentialSearchButton
          options={available}
          title="Rechercher un secteur"
          selected={selected}
          onPick={(sector) => {
            if (!selected.includes(sector)) onToggle(sector);
          }}
          className="flex items-center justify-center rounded-md border border-dashed border-border p-2.5 text-sm font-semibold text-navy-mid hover:border-navy-light"
        />
      </div>
    </div>
  );
}

function ClosingStep() {
  return (
    <div>
      <h2 className="mb-1.5 text-xl font-bold text-navy">C&apos;est prêt.</h2>
      <p className="mb-4 text-sm leading-relaxed text-text-muted">
        Votre profil est enregistré. Vous serez invité(e) par email aux prochains événements CEO
        Summit — dîners privés, webinaires et le Summit annuel.
      </p>
      <p className="text-sm leading-relaxed text-text-muted">
        Direction votre tableau de bord pour découvrir le cercle.
      </p>
    </div>
  );
}
