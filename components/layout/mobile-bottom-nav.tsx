"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Diamond, CalendarDays, Mail, User } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Accueil", icon: Home },
  { href: "/evenements", label: "Événements", icon: CalendarDays },
  { href: "/deal-room", label: "Deal Room", icon: Diamond },
  { href: "/messagerie", label: "Messages", icon: Mail, badgeKey: "messages" as const },
  { href: "/profil", label: "Profil", icon: User },
];

/**
 * Fixed bottom navigation — visible only on mobile (md:hidden).
 * Direct implementation of the .mobile-nav pattern added to /wireframe/style.css.
 * Replaces the desktop sidebar entirely on small screens (see AppShell).
 */
export function MobileBottomNav({
  badges = {},
}: {
  badges?: Partial<Record<"messages", number>>;
}) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[200] border-t border-border bg-white pb-[env(safe-area-inset-bottom,6px)] pt-1.5 md:hidden">
      <div className="flex items-center justify-around">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex min-w-14 flex-col items-center gap-0.5 px-2.5 py-1.5 text-[10px] font-medium text-text-muted",
                active && "text-navy"
              )}
            >
              <item.icon
                className={cn("h-[18px] w-[18px]", active && "text-gold")}
                strokeWidth={2}
              />
              {item.label}
              {!!badge && (
                <span className="absolute right-1 top-0 min-w-[16px] rounded-full bg-red-500 px-[5px] text-center text-[9px] font-bold text-white">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
