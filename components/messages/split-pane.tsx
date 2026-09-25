"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * E7-T01 — "Vue responsive mobile : liste plein écran → thread plein écran."
 * Both panes always render server-side; this just decides, from the
 * pathname, which one is visible on mobile. On desktop (md+) both show
 * side by side regardless.
 */
export function SplitPane({
  variant,
  className,
  children,
}: {
  variant: "list" | "detail";
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const threadOpen = pathname !== "/messagerie";
  const hiddenOnMobile = variant === "list" ? threadOpen : !threadOpen;

  /**
   * Bug trouvé le 25 sept. 2026 en testant l'audit mobile (conception/14) :
   * `cn()` (twMerge) fusionne les classes Tailwind en conflit en gardant la
   * DERNIÈRE de chaque groupe. Avec `cn(hiddenOnMobile && "hidden md:flex",
   * className)`, "hidden" arrivait AVANT le "flex" de base contenu dans
   * `className` (passé par app/messagerie/layout.tsx) — twMerge gardait donc
   * "flex" et supprimait "hidden", qui ne s'appliquait jamais : les deux
   * volets (liste + fil) restaient visibles en même temps sur mobile,
   * empilés. En mettant `className` en premier, "hidden" (ajouté après)
   * gagne bien le conflit sur le groupe sans variante ; "md:flex" reste
   * dans son propre groupe (variante md), inchangé.
   */
  return <div className={cn(className, hiddenOnMobile && "hidden md:flex")}>{children}</div>;
}
