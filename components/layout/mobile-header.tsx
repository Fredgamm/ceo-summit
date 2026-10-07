"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, User, Building2 } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Accueil", icon: Home },
  { href: "/profil", label: "Profil", icon: User },
  { href: "/entreprise", label: "Mon Entreprise", icon: Building2 },
];

/**
 * Audit mobile du 22 septembre 2026 (conception/14 §1) — header mobile fixe,
 * absent jusqu'ici : la sidebar desktop (components/layout/member-sidebar.tsx)
 * était simplement masquée sous 768px, sans équivalent de repli pour
 * Accueil/Profil/Mon Entreprise. Complète MobileBottomNav (Événements, Deal
 * Room, Salles, Messages, Déconnexion) selon le découpage header/footer
 * attendu — visible uniquement sur mobile (md:hidden), comme MobileBottomNav.
 */
export function MobileHeader() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-[200] flex items-center justify-between border-b border-border bg-white px-4 pt-[env(safe-area-inset-top,6px)] md:hidden">
      <Image src="/logo/ceo-summit-logo.png" alt="CEO Summit" width={90} height={43} priority />
      <nav className="flex items-center gap-1" aria-label="Navigation rapide">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                "flex flex-col items-center gap-0.5 px-2 py-2 text-[9px] font-medium text-text-muted",
                active && "text-navy"
              )}
            >
              <item.icon
                className={cn("h-[18px] w-[18px]", active && "text-gold")}
                strokeWidth={2}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
