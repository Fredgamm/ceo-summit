import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Accès en attente" };

/**
 * B1f (audit du 29 juillet 2026) — avant ce correctif, un candidat approuvé
 * qui n'allait jamais au bout du paiement Evolia obtenait un accès complet
 * et gratuit. middleware.ts redirige ici tout compte ACTIVE sans tier
 * personnel ni entreprise à l'abonnement actif.
 *
 * Phase 2 offres/paiement (30 juillet 2026) — deux chemins mènent
 * désormais ici : l'ancien flux candidature/Evolia (copie legacy, garde
 * son sens si l'entreprise n'a jamais été mise en place), et le nouveau
 * flux self-service sans entreprise créée — la vraie sortie de cette page
 * pour ce second cas est /entreprise/creer, pas d'attendre un email.
 */
export default async function PaymentPendingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  const hasCompany = Boolean(viewer?.companyId);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-8 shadow-card-md">
        <h1 className="mb-3 text-xl font-bold text-navy">Accès en attente</h1>
        {hasCompany ? (
          <p className="mb-6 text-sm leading-relaxed text-text-mid">
            Votre entreprise n&apos;a pas encore d&apos;abonnement actif — l&apos;accès complet à la
            plateforme s&apos;active automatiquement dès la confirmation du paiement.
          </p>
        ) : (
          <p className="mb-6 text-sm leading-relaxed text-text-mid">
            Votre compte est confirmé, mais aucune entreprise ni adhésion active n&apos;y est encore
            rattachée. Créez la fiche de votre entreprise pour inviter vos collaborateurs et choisir
            une offre.
          </p>
        )}
        {!hasCompany && (
          <Button asChild className="mb-4 w-full justify-center">
            <Link href="/entreprise/creer">Créer mon entreprise</Link>
          </Button>
        )}
        <p className="mb-6 text-xs text-text-muted">
          Une question ? Contactez l&apos;équipe CEO Summit.
        </p>
        <SignOutButton className="mx-auto flex items-center justify-center gap-2 text-sm font-semibold text-navy-mid" />
      </div>
    </div>
  );
}
