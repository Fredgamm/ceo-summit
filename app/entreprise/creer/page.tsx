import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CompanyForm } from "@/components/entreprise/company-form";

export const metadata: Metadata = { title: "Créer mon entreprise" };

/**
 * Parcours re-revu (5 août 2026) — l'entreprise se crée seule ici, sans
 * offre : le choix d'une offre vient après, sur `/entreprise/paiement`
 * (voir app/actions/company.ts::createCompany pour le détail de
 * l'inversion). Un formulaire entreprise plus long est ainsi sauvegardé dès
 * sa soumission — l'utilisateur peut revenir compléter sa fiche à tout
 * moment depuis `/entreprises/[id]`, sans dépendre d'un état d'assistant
 * perdu à la navigation.
 *
 * `?offre=<slug>` (Phase 2quater, 1er août 2026) — lien profond depuis la
 * page d'un évènement (`/evenements/[id]`) pour un utilisateur déjà connecté
 * sans entreprise : transmis tel quel à `CompanyForm`, qui l'ajoute à
 * l'URL de redirection post-création vers `/entreprise/paiement?offre=...`
 * — la résolution/validation du slug se fait là-bas, pas ici.
 */
export default async function CreateCompanyPage({
  searchParams,
}: {
  searchParams: { offre?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) redirect("/login");
  if (viewer.companyId) redirect(`/entreprises/${viewer.companyId}`);

  return (
    <div className="flex min-h-screen justify-center bg-surface p-6 pt-16">
      <CompanyForm mode="create" offerSlug={searchParams.offre} />
    </div>
  );
}
