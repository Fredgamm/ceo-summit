import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInviteButton } from "@/components/entreprise/accept-invite-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Invitation" };

/** Phase 2 offres/paiement (30 juillet 2026) — page publique reçue par email. */
export default async function InvitationPage({ params }: { params: { token: string } }) {
  const invite = await prisma.companyInvite.findUnique({
    where: { token: params.token },
    include: { company: { select: { name: true } } },
  });

  if (!invite || invite.status !== "PENDING") {
    return (
      <AuthCard title="Invitation invalide">
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertDescription>
            {!invite
              ? "Ce lien d'invitation est introuvable."
              : invite.status === "ACCEPTED"
                ? "Cette invitation a déjà été acceptée."
                : "Cette invitation a été révoquée."}
          </AlertDescription>
        </Alert>
        <Button asChild className="w-full justify-center">
          <Link href="/login">Retour à la connexion</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Rejoindre ${invite.company.name}`}
      subtitle={`Invitation envoyée à ${invite.email}`}
    >
      <AcceptInviteButton token={params.token} />
    </AuthCard>
  );
}
