import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { loadMeetingByToken } from "@/lib/meeting-response";
import {
  formatDayKey,
  formatTimeRangeInZone,
  timezoneLabel,
  zonedDayKey,
} from "@/lib/event-timezone";
import { EmailResponse } from "@/components/meetings/email-response";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Répondre à une demande de rendez-vous",
  robots: { index: false, follow: false },
};

const ALREADY: Record<string, string> = {
  CONFIRMED: "Ce rendez-vous est déjà confirmé.",
  COMPLETED: "Ce rendez-vous a déjà eu lieu.",
  DECLINED: "Cette demande a déjà été déclinée.",
  EXPIRED: "Cette demande a expiré : elle est restée sans réponse jusqu'à son échéance.",
  WITHDRAWN: "Le demandeur a retiré sa demande.",
  CANCELLED: "Ce rendez-vous a été annulé par l'organisation.",
};

/**
 * Module 21 lot 7 bis — boutons « Accepter » / « Décliner » de l'email de
 * demande (RG-15). Page publique (middleware.ts) : le jeton tient lieu de
 * session. Le rendu ne change rien à la demande ; la réponse part de
 * `EmailResponse`, côté navigateur.
 */
export default async function MeetingEmailResponsePage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ choix?: string }>;
}) {
  const { token } = await props.params;
  const { choix } = await props.searchParams;
  const meeting = await loadMeetingByToken(token);

  if (!meeting) {
    return (
      <AuthCard title="Lien invalide">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            Ce lien est introuvable. Utilisez le dernier email reçu, ou répondez depuis « Mes
            rendez-vous ».
          </AlertDescription>
        </Alert>
        <Button asChild className="mt-6 w-full justify-center">
          <Link href="/profil?onglet=mes-rendez-vous">Mes rendez-vous</Link>
        </Button>
      </AuthCard>
    );
  }

  const when = `${formatDayKey(zonedDayKey(meeting.start, meeting.timezone))}, ${formatTimeRangeInZone(meeting.start, meeting.end, meeting.timezone)} (${timezoneLabel(meeting.timezone)})`;
  const who = [meeting.requesterName, meeting.requesterCompany].filter(Boolean).join(", ");
  const choice = choix === "decliner" ? "decliner" : choix === "accepter" ? "accepter" : null;

  const summary = (
    <div className="mb-6 rounded-md bg-surface-2 p-4 text-sm text-text">
      <p className="font-semibold text-navy">{who}</p>
      <p className="mt-1">{when}</p>
      <p className="mt-1 text-text-muted">{meeting.eventTitle}</p>
    </div>
  );

  if (meeting.status !== "PENDING" || !choice) {
    return (
      <AuthCard title="Demande de rendez-vous">
        {summary}
        <Alert>
          {meeting.status === "PENDING" ? <AlertTriangle /> : <CheckCircle2 />}
          <AlertDescription>
            {meeting.status === "PENDING"
              ? "Ce lien est incomplet. Utilisez les boutons de l'email, ou répondez depuis « Mes rendez-vous »."
              : (ALREADY[meeting.status] ?? "Cette demande n'est plus en attente.")}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-6 w-full justify-center">
          <Link href="/profil?onglet=mes-rendez-vous">Voir mes rendez-vous</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={choice === "accepter" ? "Accepter le rendez-vous" : "Décliner la demande"}>
      {summary}
      <EmailResponse token={token} choice={choice} requesterName={meeting.requesterName} />
    </AuthCard>
  );
}
