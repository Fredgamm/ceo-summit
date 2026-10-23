import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { getReferentialLabels } from "@/lib/referentials-query";
import { AuthCard } from "@/components/auth/auth-card";
import { INVITATION_STEPS, JourneyShell } from "@/components/onboarding/journey-shell";
import { MembershipCard } from "@/components/onboarding/membership-card";
import { AcceptPartnerInviteForm } from "@/components/partners/accept-partner-invite-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Invitation partenaire" };

/** Module 20 — page publique reçue par e-mail par le gérant d'un partenaire. */
export default async function PartnerInvitationPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const invite = await prisma.partnerInvite.findUnique({
    where: { token: params.token },
    include: { plan: { select: { name: true } } },
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
                ? "Cette invitation a déjà été utilisée. Connectez-vous avec votre e-mail."
                : isExpired
                  ? "Cette invitation a expiré. Demandez à l'équipe CEO Summit de vous la renvoyer."
                  : "Cette invitation a été annulée."}
          </AlertDescription>
        </Alert>
        <Button asChild className="w-full justify-center">
          <Link href="/login">Aller à la connexion</Link>
        </Button>
      </AuthCard>
    );
  }

  const [sectors, countries] = await Promise.all([
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
  ]);

  // 23 oct. 2026 — même cadre que l'invitation d'un collaborateur (panneau
  // d'étapes et carte de membre), au lieu d'une carte étroite isolée.
  return (
    <JourneyShell
      steps={INVITATION_STEPS}
      current="acces"
      panelLabel="Accès partenaire"
      title={`Bienvenue, ${invite.name}`}
      subtitle={
        <>
          Créez votre compte et votre entreprise ({invite.email}). Votre accès est ouvert
          immédiatement, sans paiement. Vous inviterez ensuite vos collaborateurs depuis la fiche de
          votre entreprise.
        </>
      }
      card={
        <MembershipCard
          planName={invite.plan.name}
          detail="Accès offert par CEO Summit"
          status="invited"
        />
      }
      headerAction={
        <Link href="/login" className="text-sm font-semibold text-navy hover:underline">
          Se connecter
        </Link>
      }
    >
      <AcceptPartnerInviteForm token={params.token} sectors={sectors} countries={countries} />
    </JourneyShell>
  );
}
