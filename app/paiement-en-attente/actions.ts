"use server";

import { redirect } from "next/navigation";

import { auth, unstable_update } from "@/auth";

/**
 * Relit l'accès entreprise en base et le réécrit dans la session (voir le
 * callback `jwt` de auth.ts), puis ouvre l'espace membre. Appelé quand
 * l'abonnement est devenu actif depuis la connexion, typiquement juste
 * après la validation du paiement par l'admin ou par Evolia.
 *
 * `destination` : page interne où arriver (par défaut le tableau de bord) —
 * un chemin relatif uniquement, jamais une autre origine.
 */
export async function refreshCompanyAccess(destination?: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await unstable_update({});
  const isInternalPath =
    typeof destination === "string" &&
    destination.startsWith("/") &&
    !destination.startsWith("//") &&
    !destination.includes("\\");
  redirect(isInternalPath ? destination : "/dashboard");
}
