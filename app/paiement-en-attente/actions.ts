"use server";

import { redirect } from "next/navigation";

import { auth, unstable_update } from "@/auth";

/**
 * Relit l'accès entreprise en base et le réécrit dans la session (voir le
 * callback `jwt` de auth.ts), puis ouvre l'espace membre. Appelé quand
 * l'abonnement est devenu actif depuis la connexion, typiquement juste
 * après la validation du paiement par l'admin.
 */
export async function refreshCompanyAccess(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  await unstable_update({});
  redirect("/dashboard");
}
