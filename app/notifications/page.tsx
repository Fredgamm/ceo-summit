import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, CalendarClock, Diamond, Mail } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadNotifications } from "@/lib/notifications";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PushToggle } from "@/components/notifications/push-toggle";

export const metadata: Metadata = { title: "Notifications" };

/** Une notification : icône et texte en haut, bouton dessous sur téléphone, à droite ensuite. */
function NotificationCard({
  icon,
  title,
  detail,
  href,
  actionLabel,
  outline,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  outline?: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-light text-navy">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">{title}</p>
          <p className="text-xs text-text-muted">{detail}</p>
        </div>
      </div>
      <Button
        asChild
        size="sm"
        variant={outline ? "outline" : "default"}
        className="w-full sm:w-auto"
      >
        <Link href={href}>{actionLabel}</Link>
      </Button>
    </li>
  );
}

/**
 * Notifications (3 nov. 2026) — ce qui attend une réponse du membre, déduit des
 * données existantes (demandes de rendez-vous B2B, demandes de contact du Deal
 * Room) plus ses messages non lus. Pas de nouvelle table : la liste se met à
 * jour d'elle-même quand la demande reçoit une réponse ou expire.
 */
export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, avatarUrl: true, isPlatformAdmin: true },
  });
  if (!viewer) redirect("/login");

  const { items, unreadMessages } = await loadNotifications(session.user.id);
  const empty = items.length === 0 && unreadMessages === 0;

  return (
    <AppShell
      user={{ name: viewer.name, avatarUrl: viewer.avatarUrl, isAdmin: viewer.isPlatformAdmin }}
      badges={{ messages: unreadMessages || undefined }}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-xl font-bold text-navy">Notifications</h1>

        <PushToggle />

        {empty ? (
          <EmptyState
            icon={Bell}
            title="Vous êtes à jour"
            description="Les demandes de rendez-vous, les demandes de contact et les messages qui attendent votre réponse apparaissent ici."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <NotificationCard
                key={item.id}
                icon={
                  item.kind === "meeting" ? (
                    <CalendarClock className="h-5 w-5" aria-hidden />
                  ) : (
                    <Diamond className="h-5 w-5" aria-hidden />
                  )
                }
                title={item.title}
                detail={item.detail}
                href={item.href}
                actionLabel={item.actionLabel}
              />
            ))}
            {unreadMessages > 0 && (
              <NotificationCard
                icon={<Mail className="h-5 w-5" aria-hidden />}
                title={`${unreadMessages} message${unreadMessages > 1 ? "s" : ""} non lu${unreadMessages > 1 ? "s" : ""}`}
                detail="Dans votre messagerie"
                href="/messagerie"
                actionLabel="Ouvrir"
                outline
              />
            )}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
