import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { AuthCard } from "@/components/auth/auth-card";
import { INVITATION_STEPS, JourneyShell } from "@/components/onboarding/journey-shell";
import { MembershipCard } from "@/components/onboarding/membership-card";
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

  const isExpired = invite != null && invite.status === "PENDING" && invite.expiresAt < new Date();

  if (!invite || invite.status !== "PENDING" || isExpired) {
    return (
      <AuthCard title="Invitation invalide">
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertDescription>
            {!invite
              ? "Ce lien d'invitation est introuvable."
              : invite.status === "ACCEPTED"
                ? "Cette invitation a déjà été acceptée."
                : isExpired
                  ? "Cette invitation a expiré. Demandez-en une nouvelle à l'administrateur de votre entreprise."
                  : "Cette invitation a été révoquée."}
          </AlertDescription>
        </Alert>
        <Button asChild className="w-full justify-center">
          <Link href="/login">Retour à la connexion</Link>
        </Button>
      </AuthCard>
    );
  }

  const inviter = await prisma.user.findUnique({
    where: { id: invite.invitedById },
    select: { name: true },
  });
  const inviterName = inviter?.name ?? "Votre gérant";

  return (
    <JourneyShell
      steps={INVITATION_STEPS}
      current="acces"
      panelLabel="Rejoindre votre entreprise"
      title={`Rejoignez ${invite.company.name}`}
      subtitle={
        <>
          {inviterName} vous invite sur CEO Summit, le cercle des décideurs de l&apos;Océan Indien.
          Choisissez votre mot de passe pour activer votre accès ({invite.email}).
        </>
      }
      card={
        <MembershipCard
          planName={invite.name}
          detail={`Invité(e) par ${inviterName}`}
          companyName={invite.company.name}
          status="invited"
        />
      }
      headerAction={
        <Link href="/login" className="text-sm font-semibold text-navy hover:underline">
          Se connecter
        </Link>
      }
    >
      <AcceptInviteButton token={params.token} />
    </JourneyShell>
  );
}
