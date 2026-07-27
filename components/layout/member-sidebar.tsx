"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Diamond,
  CalendarDays,
  LayoutGrid,
  MessagesSquare,
  Mail,
  User,
  Building2,
  Settings,
  LogOut,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Accueil", icon: Home },
  { href: "/deal-room", label: "Deal Room", icon: Diamond, badgeKey: "opportunities" as const },
  { href: "/evenements", label: "Événements", icon: CalendarDays },
  { href: "/catalogue", label: "Catalogue", icon: LayoutGrid },
  { href: "/salles", label: "Salles", icon: MessagesSquare, badgeKey: "rooms" as const },
  { href: "/messagerie", label: "Messagerie", icon: Mail, badgeKey: "messages" as const },
];

const BOTTOM_ITEMS = [
  { href: "/profil/editer", label: "Mon Profil", icon: User },
  { href: "/entreprise", label: "Mon Entreprise", icon: Building2 },
];

interface MemberSidebarProps {
  user: { name: string; tier: string; avatarUrl?: string | null; isAdmin?: boolean };
  badges?: Partial<Record<"opportunities" | "rooms" | "messages", number>>;
}

/**
 * Desktop-only navy sidebar (220px), hidden below md via AppShell.
 * Mirrors /wireframe/dashboard.html nav — kept 1:1 with the validated wireframe.
 */
export function MemberSidebar({ user, badges = {} }: MemberSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-sidebar flex-col overflow-y-auto bg-navy md:flex">
      <div className="border-b border-white/10 px-[18px] py-[18px] pb-3.5">
        <div className="text-[17px] font-extrabold tracking-tight text-white">
          CEO<span className="text-gold">Summit</span>
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/40">
          Océan Indien · Décideurs
        </div>
      </div>

      <Link
        href="/profil/editer"
        className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 py-3.5 transition-colors hover:bg-white/5"
      >
        <Avatar className="h-10 w-10">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold text-white">{user.name}</div>
          <div className="text-[11.5px] text-white/50">{user.tier}</div>
        </div>
        <span className="text-white/30">›</span>
      </Link>

      <nav className="flex-1 py-2.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-2.5 border-r-[3px] border-transparent px-[18px] py-2.5 text-[13.5px] text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white/90",
                active && "border-gold bg-gold/10 text-gold"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span>{item.label}</span>
              {!!badge && (
                <span className="ml-auto min-w-[18px] rounded-full bg-red-500 px-1.5 text-center text-[10px] font-bold text-white">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.08] py-1.5">
        {BOTTOM_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 border-r-[3px] border-transparent px-[18px] py-2.5 text-[13.5px] text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white/90",
                active && "border-gold bg-gold/10 text-gold"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {user.isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-2.5 border-r-[3px] border-transparent px-[18px] py-2.5 text-[13.5px] text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white/90"
          >
            <Settings className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>Administration</span>
          </Link>
        )}
        <Link
          href="/login"
          className="flex items-center gap-2.5 border-r-[3px] border-transparent px-[18px] py-2.5 text-[13.5px] text-white/60 transition-colors hover:bg-white/[0.07] hover:text-white/90"
        >
          <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span>Déconnexion</span>
        </Link>
      </div>
    </aside>
  );
}
