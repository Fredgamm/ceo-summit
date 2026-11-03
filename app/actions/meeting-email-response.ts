"use server";

import { redirect } from "next/navigation";

import { respondToMeetingByToken } from "@/lib/meeting-response";

type ActionResult = { success: true; data: undefined } | { success: false; error: string };

/**
 * Module 21 lot 7 bis (3 nov. 2026) — réponse depuis les boutons de l'email de
 * demande. Action publique : le jeton (256 bits, haché en base, à usage
 * unique) tient lieu de session, comme pour la réinitialisation du mot de
 * passe.
 */
export async function respondByEmailToken(
  token: string,
  choice: "accepter" | "decliner"
): Promise<ActionResult> {
  if (choice !== "accepter" && choice !== "decliner") {
    return { success: false, error: "Ce lien n'est pas valide." };
  }
  return respondToMeetingByToken(token, choice);
}

/**
 * Repli sans JavaScript : la page envoie normalement la réponse toute seule ;
 * sans script, un formulaire permet de la confirmer d'un clic. Une fois la
 * réponse enregistrée, la page affiche le résultat.
 */
export async function respondByEmailForm(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const choice = formData.get("choix") === "decliner" ? "decliner" : "accepter";
  await respondToMeetingByToken(token, choice);
  redirect(`/rendez-vous/repondre/${encodeURIComponent(token)}?choix=${choice}`);
}
