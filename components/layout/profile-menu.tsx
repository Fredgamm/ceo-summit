"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarClock, ChevronDown, User } from "lucide-react";

import { InstallAppButton } from "@/components/layout/install-app-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { isMyCompanyActive, isProfileMenuActive, isUnder } from "@/lib/mobile-nav";
import { cn } from "@/lib/utils";

const ITEM =
  "flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-text hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";

/**
 * Menu « Profil » de la barre du haut (mobile, 3 nov. 2026) : il regroupe ce
 * qui encombrait la barre — le profil, l'entreprise, l'installation de
 * l'application et la déconnexion. S'ouvre sous le bouton, se referme au
 * toucher ailleurs, à Échap ou en changeant de page.
 */
export function ProfileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const active = isProfileMenuActive(pathname);

  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profil et compte"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex flex-col items-center gap-0.5 px-1.5 py-2 text-[9px] font-medium text-text-muted",
          (active || open) && "text-navy"
        )}
      >
        <User className={cn("h-[18px] w-[18px]", active && "text-gold")} strokeWidth={2} />
        <span className="flex items-center">
          Profil
          <ChevronDown
            className={cn("h-2.5 w-2.5 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profil et compte"
          className="absolute right-0 top-full z-[210] mt-1 w-60 overflow-hidden rounded-lg border border-border bg-white shadow-card-md"
        >
          <Link
            href="/profil"
            role="menuitem"
            className={cn(ITEM, isUnder(pathname, "/profil") && "text-navy")}
          >
            <User className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            Mon profil
          </Link>
          <Link href="/profil?onglet=mes-rendez-vous" role="menuitem" className={ITEM}>
            <CalendarClock className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            Mes rendez-vous
          </Link>
          <Link
            href="/entreprise"
            role="menuitem"
            className={cn(ITEM, isMyCompanyActive(pathname) && "text-navy")}
          >
            <Building2 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            Mon entreprise
          </Link>
          <InstallAppButton className={ITEM} iconClassName="h-4 w-4 shrink-0 text-text-muted" />
          <div className="border-t border-border" />
          <SignOutButton className={cn(ITEM, "text-red-600 hover:bg-red-50")} />
        </div>
      )}
    </div>
  );
}
