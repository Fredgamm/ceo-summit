"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Diamond, Home, LayoutGrid, Mail, MessagesSquare } from "lucide-react";

import { isUnder } from "@/lib/mobile-nav";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Accueil", icon: Home },
  { href: "/catalogue", label: "Membres", icon: LayoutGrid },
  { href: "/deal-room", label: "Deal Room", icon: Diamond, badgeKey: "opportunities" as const },
  { href: "/salles", label: "Salles", icon: MessagesSquare, badgeKey: "rooms" as const },
  { href: "/messagerie", label: "Messages", icon: Mail, badgeKey: "messages" as const },
];

const ITEM_CLASSNAME =
  "relative flex min-w-14 flex-col items-center gap-0.5 px-2.5 py-1.5 text-[10px] font-medium text-text-muted";

/**
 * Fixed bottom navigation — visible only on mobile (md:hidden).
 * Direct implementation of the .mobile-nav pattern added to /wireframe/style.css.
 *
 * Audit mobile du 22 septembre 2026 (conception/14 §1) — Accueil et Profil
 * sont passés dans MobileHeader (nouveau), qui complète cette barre selon le
 * découpage header/footer attendu ; Salles et Déconnexion (absents
 * jusqu'ici) les remplacent ici. Complète, avec MobileHeader, le repli
 * mobile de la sidebar desktop (components/layout/member-sidebar.tsx).
 *
 * 14 oct. 2026 — navigation du quotidien en bas, à portée de pouce.
 * 3 nov. 2026 — Accueil, Membres, Deal Room, Salles, Messages. « Mon
 * entreprise » rejoint le menu « Profil » de la barre du haut (MobileHeader),
 * avec l'installation de l'application et la déconnexion.
 */
export function MobileBottomNav({
  badges = {},
}: {
  badges?: Partial<Record<"opportunities" | "rooms" | "messages", number>>;
}) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[200] border-t border-border bg-white pb-[env(safe-area-inset-bottom,6px)] pt-1.5 md:hidden">
      <div className="flex items-center justify-around">
        {ITEMS.map((item) => {
          const active = isUnder(pathname, item.href);
          const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(ITEM_CLASSNAME, active && "text-navy")}
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
