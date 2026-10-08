"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminRole } from "@prisma/client";
import {
  Home,
  Users,
  CalendarDays,
  CalendarClock,
  Diamond,
  LayoutGrid,
  Briefcase,
  Mail,
  Mails,
  Landmark,
  Settings,
  Tag,
  Building2,
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
    badgeKey?: "opportunities" | "companies";
  }[];
}[] = [
  {
    title: "Vue générale",
    items: [{ href: "/admin", label: "Tableau de bord", icon: Home, section: "dashboard" }],
  },
  {
    title: "Membres",
    items: [{ href: "/admin/membres", label: "Membres", icon: Users, section: "membres" }],
  },
  {
    title: "Contenu",
    items: [
      { href: "/admin/evenements", label: "Événements", icon: CalendarDays, section: "evenements" },
      {
        href: "/admin/rendez-vous",
        label: "Créneaux rendez-vous",
        icon: CalendarClock,
        section: "evenements",
      },
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
      {
        href: "/admin/entreprises",
        label: "Entreprises",
        icon: Building2,
        section: "entreprises",
        badgeKey: "companies",
      },
      {
        href: "/admin/communications",
        label: "Communications",
        icon: Mail,
        section: "communications",
      },
      {
        href: "/admin/emails",
        label: "Emails",
        icon: Mails,
        section: "emails",
      },
    ],
  },
  {
    title: "Gestion",
    items: [
      { href: "/admin/finances", label: "Finances", icon: Landmark, section: "finances" },
      { href: "/admin/plans", label: "Offres", icon: Tag, section: "plans" },
      { href: "/admin/parametres", label: "Paramètres", icon: Settings, section: "parametres" },
    ],
  },
];

interface AdminSidebarProps {
  admin: { name: string; email: string; role: AdminRole };
  badges?: Partial<Record<"opportunities" | "companies", number>>;
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
        <Image src="/logo/ceo-summit-logo-dark.png" alt="CEO Summit" width={150} height={72} />
        <div className="mt-3 uppercase leading-tight tracking-wider">
          <div className="text-[9px] text-white/50">Conquérir de nouveaux possibles</div>
          <div className="text-[7px] text-white/35">The power to go beyond</div>
        </div>
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy">
          ⚙ Admin
        </div>
      </div>

      <nav className="flex-1 py-2" aria-label="Navigation admin">
        {visibleSections.map((section) => (
          <div key={section.title}>
            <div className="px-[18px] pb-[5px] pt-3.5 text-[10px] uppercase tracking-wide text-white/60">
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
      </nav>

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
