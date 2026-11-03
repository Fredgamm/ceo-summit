import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, MapPin } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { countUnreadMessages } from "@/lib/conversations";
import {
  formatDayKey,
  formatTimeInZone,
  formatTimeRangeInZone,
  timezoneLabel,
  zonedDayKey,
} from "@/lib/event-timezone";
import { loadMemberMeetingView, missingMeetingProfileFields } from "@/lib/meeting-participation";
import { AppShell } from "@/components/layout/app-shell";
import { RequestMeeting, type RequestDayView } from "@/components/meetings/request-meeting";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Demander un rendez-vous" };

/**
 * Module 21 (3 nov. 2026) — page « Demander un rendez-vous » d'un participant.
 * Elle remplace l'onglet « Rendez-vous événement » du profil : on y arrive par
 * le bouton de l'en-tête du profil, et « Retour au profil » est toujours en
 * haut. Les règles (RG-01 à RG-11) restent vérifiées côté serveur par
 * `requestMeeting` ; cette page ne fait que les présenter.
 */
export default async function MemberMeetingRequestPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.id === id) redirect("/profil");

  const [member, viewer] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        title: true,
        avatarUrl: true,
        company: { select: { name: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        companyId: true,
        avatarUrl: true,
        isPlatformAdmin: true,
      },
    }),
  ]);
  if (!member) notFound();
  if (!viewer) redirect("/login");

  // Pas de rendez-vous possible entre eux (pas les deux participants, ou
  // réservation fermée) : retour au profil, qui n'affiche alors pas le bouton.
  const meeting = await loadMemberMeetingView(viewer.id, member.id);
  if (!meeting) redirect(`/membres/${member.id}`);

  const tz = meeting.timezone;
  const viewerMissing = missingMeetingProfileFields(viewer);
  const days: RequestDayView[] = meeting.days.map((d) => ({
    key: d.day,
    slots: d.slots.map((s) => ({
      id: s.id,
      range: formatTimeRangeInZone(s.startTime, s.endTime, tz),
      state: s.state,
    })),
  }));
  const unreadMessages = await countUnreadMessages(viewer.id);

  const blocked = meeting.existingBooking
    ? `Vous avez déjà ${meeting.existingBooking.status === "PENDING" ? "une demande en cours" : "un rendez-vous"} avec ${member.name} (${formatDayKey(zonedDayKey(meeting.existingBooking.startTime, tz))}, ${formatTimeInZone(meeting.existingBooking.startTime, tz)}). On ne peut avoir qu'un rendez-vous à la fois avec la même personne.`
    : null;

  return (
    <AppShell
      user={{ name: viewer.name, avatarUrl: viewer.avatarUrl, isAdmin: viewer.isPlatformAdmin }}
      badges={{ messages: unreadMessages || undefined }}
    >
      {/* Page courte et lisible d'un coup d'œil : qui, où, puis trois étapes (components/meetings/request-meeting.tsx). */}
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Link
          href={`/membres/${member.id}`}
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-navy-mid hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Retour au profil
        </Link>

        <div className="rounded-2xl border border-border bg-white p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Avatar className="h-14 w-14 shrink-0">
              <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
              <AvatarFallback>{initials(member.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight text-navy sm:text-xl">
                Rendez-vous avec {member.name}
              </h1>
              <p className="truncate text-sm text-text-muted">
                {[member.title, member.company?.name].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <details className="mt-3 text-sm text-text-mid">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium">
              <MapPin className="h-4 w-4 shrink-0 text-gold" aria-hidden />
              <span>{meeting.zone}</span>
              {meeting.accessInstructions && (
                <span className="text-xs font-semibold text-navy-mid underline">
                  Comment s&apos;y rendre ?
                </span>
              )}
            </summary>
            {meeting.accessInstructions && (
              <p className="mt-2 pl-[1.375rem] text-text">{meeting.accessInstructions}</p>
            )}
          </details>
        </div>

        {blocked ? (
          <Alert>
            <AlertTriangle />
            <AlertDescription>
              {blocked}{" "}
              <Link href="/profil?onglet=mes-rendez-vous" className="font-semibold underline">
                Voir mes rendez-vous
              </Link>
            </AlertDescription>
          </Alert>
        ) : viewerMissing.length > 0 ? (
          <Alert>
            <AlertTriangle />
            <AlertDescription>
              Avant de demander un rendez-vous, complétez votre profil ({viewerMissing.join(", ")}).{" "}
              <Button asChild variant="link" className="h-auto p-0">
                <Link href="/profil/editer">Compléter mon profil</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : meeting.memberUnavailable ? (
          <Alert>
            <AlertTriangle />
            <AlertDescription>
              {member.name} ne peut pas encore recevoir de demande de rendez-vous.
            </AlertDescription>
          </Alert>
        ) : (
          <RequestMeeting
            memberId={member.id}
            memberName={member.name}
            timezoneLabel={timezoneLabel(tz)}
            days={days}
          />
        )}
      </div>
    </AppShell>
  );
}
