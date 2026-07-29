"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminRole } from "@prisma/client";
import {
  Home,
  ClipboardList,
  Users,
  CalendarDays,
  Diamond,
  LayoutGrid,
  Briefcase,
  CreditCard,
  Mail,
  Landmark,
  Settings,
  ArrowLeft,
} from "lucide-react";

import { canAccessSection, type AdminSection } from "@/lib/admin-rbac";
import { cn } from "@/lib/utils";

const SECTIONS: {
  title: string;
  items: {
    href: string;
    label: string;
    icon: typeof Home;
    section: AdminSection;
    badgeKey?: "candidatures" | "opportunities";
  }[];
}[] = [
  {
    title: "Vue générale",
    items: [{ href: "/admin", label: "Tableau de bord", icon: Home, section: "dashboard" }],
  },
  {
    title: "Membres",
    items: [
      {
        href: "/admin/candidatures",
        label: "Candidatures",
        icon: ClipboardList,
        section: "candidatures",
        badgeKey: "candidatures",
      },
      { href: "/admin/membres", label: "Membres", icon: Users, section: "membres" },
    ],
  },
  {
    title: "Contenu",
    items: [
      { href: "/admin/evenements", label: "Événements", icon: CalendarDays, section: "evenements" },
      {
        href: "/admin/deal-room",
        label: "Deal Room",
        icon: Diamond,
        section: "deal-room",
        badgeKey: "opportunities",
      },
      { href: "/admin/salles", label: "Salles", icon: LayoutGrid, section: "salles" },
      {
        href: "/admin/catalogue-services",
        label: "Catalogue services",
        icon: Briefcase,
        section: "services",
      },
    ],
  },
  {
    title: "Opérations",
    items: [
      { href: "/admin/credits", label: "Crédits", icon: CreditCard, section: "credits" },
      {
        href: "/admin/communications",
        label: "Communications",
        icon: Mail,
        section: "communications",
      },
    ],
  },
  {
    title: "Gestion",
    items: [
      { href: "/admin/finances", label: "Finances", icon: Landmark, section: "finances" },
      { href: "/admin/parametres", label: "Paramètres", icon: Settings, section: "parametres" },
    ],
  },
];

interface AdminSidebarProps {
  admin: { name: string; email: string; role: AdminRole };
  badges?: Partial<Record<"candidatures" | "opportunities", number>>;
}

/**
 * Backoffice sidebar (240px, navy-dark #0D1B42) — 1:1 with /wireframe-bo/*.html nav.
 * Kept as its own component (not reusing MemberSidebar) since the BO has a distinct
 * dark theme, no tier badge, and a "Vue membre" escape hatch back to the front app.
 *
 * E8-T01 — sections a sub-role can't reach (e.g. financier + parametres) simply
 * don't render here. The real gate is server-side per route (canAccessSection
 * checked again in each /admin/* page) — this filtering is a UX courtesy, not
 * the security boundary.
 */
export function AdminSidebar({ admin, badges = {} }: AdminSidebarProps) {
  const pathname = usePathname();
  const visibleSections = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAccessSection(admin.role, item.section)),
  })).filter((section) => section.items.length > 0);

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-sidebar-bo flex-col overflow-y-auto bg-navy-dark">
      <div className="border-b border-white/[0.08] px-5 py-[14px]">
        <div className="text-[17px] font-extrabold tracking-tight text-white">
          CEO<span className="text-gold">Summit</span>
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/40">
          Océan Indien · Décideurs
        </div>
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy">
          ⚙ Admin
        </div>
      </div>

      <div className="flex-1 py-2">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <div className="px-[18px] pb-[5px] pt-3.5 text-[10px] uppercase tracking-wide text-white/30">
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
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
                  {!!badge && (
                    <span className="ml-auto min-w-[18px] rounded-full bg-red-500 px-1.5 text-center text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.08] p-4">
        <div className="mb-2 text-[12.5px]">
          <strong className="block text-white">{admin.name}</strong>
          <span className="text-white/50">{admin.email}</span>
        </div>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-[12.5px] text-white/60 hover:text-white/90"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Vue membre
        </Link>
      </div>
    </aside>
  );
}
