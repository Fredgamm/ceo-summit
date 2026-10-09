"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getReferentialLabels } from "@/lib/referentials-query";
import { requireViewer } from "@/lib/require-viewer";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * E1-T05 — Onboarding nouveau membre (`/bienvenue`).
 * Ref: BACKLOG_DEV.md E1-T05 + conception/01_onboarding_acces.md UC-05/US-010/US-011.
 *
 * Each step persists as soon as the member clicks "Suivant" — not just on
 * the final "Terminer" — so closing the tab mid-flow loses nothing (backlog
 * acceptance: "Progress sauvegardée à chaque étape").
 *
 * Photo upload (R2) and company linking are intentionally out of scope here
 * — they belong to E2-T02 (édition profil) and E2-T05 (profil entreprise),
 * which don't exist yet. This step only touches fields that already exist
 * on User (title, bio, sectors).
 */

const profileStepSchema = z.object({
  title: z.string().trim().max(120).optional().default(""),
  bio: z
    .string()
    .trim()
    .max(750, "La bio ne doit pas dépasser 150 mots environ (750 caractères).")
    .optional()
    .default(""),
});

export async function saveOnboardingProfileStep(title: string, bio: string): Promise<ActionResult> {
  const parsed = profileStepSchema.safeParse({ title, bio });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }

  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;

  await prisma.user.update({
    where: { id: viewerResult.viewer.id },
    data: { title: parsed.data.title || null, bio: parsed.data.bio || null },
  });

  return { success: true, data: undefined };
}

export async function saveOnboardingSectorsStep(sectors: string[]): Promise<ActionResult> {
  const validSectors = await getReferentialLabels("sector");
  const valid = sectors.filter((s) => validSectors.includes(s));
  if (valid.length !== sectors.length) {
    return { success: false, error: "Secteur inconnu." };
  }

  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;

  await prisma.user.update({ where: { id: viewerResult.viewer.id }, data: { sectors: valid } });

  return { success: true, data: undefined };
}

/**
 * Called either from the final step's "Terminer" button or from the
 * "Passer" button available at every step (US-010) — both end the tutorial
 * for good; it never re-triggers on later logins (checked in the page).
 *
 * Correctif (7 août 2026, audit) — ces 3 actions appelaient auparavant un
 * `requireActiveUserId()` local qui levait une `Error` brute au lieu de
 * retourner `ActionResult`, seule fonction du fichier à casser cette
 * convention (partagée par toutes les autres actions membre du projet) —
 * une session expirée pendant l'onboarding aurait fait planter l'action
 * avec une erreur non gérée plutôt que le message gracieux habituel.
 * Remplacé par `requireViewer()` (lib/require-viewer.ts), qui suit la
 * convention et ferme au passage le même trou que partout ailleurs : sans
 * lui, un compte suspendu entre-temps pouvait encore sauvegarder ses
 * étapes d'onboarding.
 */
export async function finishOnboarding(): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;

  const { viewer } = viewerResult;
  // Un collaborateur ne choisit pas de secteur à l'accueil : il reprend celui
  // de son entreprise, pour figurer dans l'annuaire et les envois filtrés
  // par secteur. Il peut le modifier ensuite depuis son profil.
  const companySector = viewer.company?.sector;
  await prisma.user.update({
    where: { id: viewer.id },
    data: {
      onboardingCompletedAt: new Date(),
      ...(viewer.sectors.length === 0 && companySector ? { sectors: [companySector] } : {}),
    },
  });

  return { success: true, data: undefined };
}
