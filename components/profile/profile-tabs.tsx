"use client";

import * as React from "react";

import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface ProfileTabsContextValue {
  tab: string;
  setTab: (tab: string) => void;
}

const ProfileTabsContext = React.createContext<ProfileTabsContextValue | null>(null);

function useProfileTabs(): ProfileTabsContextValue {
  const ctx = React.useContext(ProfileTabsContext);
  if (!ctx) throw new Error("ProfileTabs manquant");
  return ctx;
}

/**
 * Onglets de la fiche membre (3 nov. 2026) — Radix `Tabs` contrôlé, enveloppe
 * aussi l'en-tête de la page : sur mobile, « Mes rendez-vous » est un bouton de
 * l'en-tête (et du menu « Profil ») plutôt qu'un onglet de plus, et « Mes
 * créneaux » devient une vue du même espace (`RdvViewSwitch`).
 * L'onglet ouvert est reporté dans l'adresse (`?onglet=`) sans recharger.
 */
export function ProfileTabs({
  defaultTab,
  children,
}: {
  defaultTab: string;
  children: React.ReactNode;
}) {
  const [tab, setTabState] = React.useState(defaultTab);

  const setTab = React.useCallback((next: string) => {
    setTabState(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("onglet", next);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // Adresse non modifiable : l'onglet change quand même.
    }
  }, []);

  const value = React.useMemo(() => ({ tab, setTab }), [tab, setTab]);

  return (
    <ProfileTabsContext.Provider value={value}>
      <Tabs value={tab} onValueChange={setTab}>
        {children}
      </Tabs>
    </ProfileTabsContext.Provider>
  );
}

/** Bouton d'en-tête qui ouvre un onglet (sans être un onglet de la liste). */
export function ProfileTabButton({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setTab } = useProfileTabs();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setTab(value);
        document.getElementById("profile-tabs-top")?.scrollIntoView({ block: "start" });
      }}
    >
      {children}
    </button>
  );
}

/** Mobile : bascule « Demandes | Mes créneaux » à l'intérieur de l'espace rendez-vous. */
export function RdvViewSwitch({ pending = 0 }: { pending?: number }) {
  const { tab, setTab } = useProfileTabs();
  const items = [
    { value: "mes-rendez-vous", label: "Demandes", badge: pending },
    { value: "creneaux", label: "Mes créneaux", badge: 0 },
  ];
  return (
    <div
      role="group"
      aria-label="Rendez-vous"
      className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 md:hidden"
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={tab === item.value}
          onClick={() => setTab(item.value)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
            tab === item.value ? "bg-white text-navy shadow-sm" : "text-text-mid"
          )}
        >
          {item.label}
          {item.badge > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
              {item.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
