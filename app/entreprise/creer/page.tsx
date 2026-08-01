import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CompanyForm } from "@/components/entreprise/company-form";

export const metadata: Metadata = { title: "Créer mon entreprise" };

/** Phase 2 offres/paiement — création de fiche entreprise par un membre. */
export default async function CreateCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) redirect("/login");
  if (viewer.companyId) redirect(`/entreprises/${viewer.companyId}`);

  return (
    <div className="flex min-h-screen justify-center bg-surface p-6 pt-16">
      <div className="w-full max-w-2xl">
        <h1 className="mb-1 text-xl font-bold text-navy">Créer mon entreprise</h1>
        <p className="mb-4 text-sm text-text-muted">
          Vous deviendrez l&apos;administrateur de cette fiche — vous pourrez inviter des
          collaborateurs et choisir une offre à l&apos;étape suivante.
        </p>
        <CompanyForm mode="create" />
      </div>
    </div>
  );
}
