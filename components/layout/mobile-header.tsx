"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays } from "lucide-react";

import { badgeLabel, isUnder } from "@/lib/mobile-nav";
import { ProfileMenu } from "@/components/layout/profile-menu";
import { cn } from "@/lib/utils";

const ITEM_CLASSNAME =
  "relative flex flex-col items-center gap-0.5 px-1.5 py-2 text-[9px] font-medium text-text-muted";

/**
 * Header mobile fixe (audit mobile du 22 septembre 2026, conception/14 §1).
 *
 * 3 nov. 2026 — allégé : Événements, Notifications (cloche, avec le nombre de
 * demandes qui attendent une réponse) et Profil. « Profil » ouvre un menu qui
 * regroupe Mon profil, Mon entreprise, Installer l'application et la
 * déconnexion. Le Deal Room passe dans la barre du bas (MobileBottomNav).
 * Visible uniquement sur mobile (md:hidden), comme MobileBottomNav.
 */
export function MobileHeader({ notifications = 0 }: { notifications?: number }) {
  const pathname = usePathname();
  const eventsActive = isUnder(pathname, "/evenements");
  const notificationsActive = isUnder(pathname, "/notifications");

  return (
    <header className="fixed inset-x-0 top-0 z-[200] flex items-center justify-between border-b border-border bg-white px-4 pt-[env(safe-area-inset-top,6px)] md:hidden">
      <Image src="/logo/ceo-summit-logo.png" alt="CEO Summit" width={90} height={43} priority />
      <nav className="flex items-center" aria-label="Navigation rapide">
        <Link
          href="/evenements"
          aria-label="Événements"
          className={cn(ITEM_CLASSNAME, eventsActive && "text-navy")}
        >
          <CalendarDays
            className={cn("h-[18px] w-[18px]", eventsActive && "text-gold")}
            strokeWidth={2}
          />
          Événements
        </Link>

        <Link
          href="/notifications"
          aria-label={
            notifications > 0 ? `Notifications : ${notifications} en attente` : "Notifications"
          }
          className={cn(ITEM_CLASSNAME, notificationsActive && "text-navy")}
        >
          <Bell
            className={cn("h-[18px] w-[18px]", notificationsActive && "text-gold")}
            strokeWidth={2}
          />
          Notifications
          {notifications > 0 && (
            <span className="absolute right-3 top-0.5 min-w-[16px] rounded-full bg-red-500 px-[5px] text-center text-[9px] font-bold leading-4 text-white">
              {badgeLabel(notifications)}
            </span>
          )}
        </Link>

        <ProfileMenu />
      </nav>
    </header>
  );
}
