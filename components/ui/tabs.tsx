"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";
import { centeredScrollLeft, fadeMask, scrollEdges } from "@/lib/tab-scroll";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, style, ...props }, forwardedRef) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      listRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

  // Mobile (3 nov. 2026) : 6 onglets ne tiennent pas dans la largeur d'un
  // téléphone. On recentre l'onglet actif (ouvert par un lien, un clic ou un
  // retour) et on estompe le bord où la liste continue, la barre de
  // défilement étant masquée. Sur ordinateur tout tient : aucun effet.
  React.useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const refresh = () => setEdges(scrollEdges(list));
    const revealActive = () => {
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) return;
      list.scrollTo({
        left: centeredScrollLeft({
          activeLeft: active.offsetLeft,
          activeWidth: active.offsetWidth,
          clientWidth: list.clientWidth,
          scrollWidth: list.scrollWidth,
        }),
      });
    };
    revealActive();
    refresh();
    const observer = new MutationObserver(() => {
      revealActive();
      refresh();
    });
    observer.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
    list.addEventListener("scroll", refresh, { passive: true });
    window.addEventListener("resize", refresh);
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, []);

  const mask = fadeMask(edges);
  return (
    <TabsPrimitive.List
      ref={setRefs}
      className={cn(
        // Rapport QA du 7 oct. 2026 (§3.6) — les onglets ne doivent pas élargir la
        // page sur mobile. 21 oct. 2026 : une seule ligne qui défile (barre masquée)
        // plutôt qu'un passage à la ligne, retour à la ligne à partir de md.
        // Ligne de base en ombre intérieure, pas en bordure : avec le défilement,
        // le -mb-0.5 des onglets (soulignement posé sur la bordure) serait rogné.
        // `relative` : les positions des onglets se mesurent par rapport à la liste.
        "relative flex flex-nowrap items-center overflow-x-auto shadow-[inset_0_-2px_0_0_hsl(var(--border))] [scrollbar-width:none] md:flex-wrap [&::-webkit-scrollbar]:hidden",
        className
      )}
      style={mask ? { ...style, maskImage: mask, WebkitMaskImage: mask } : style}
      {...props}
    />
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm sm:px-5 font-semibold text-muted-foreground transition-colors data-[state=active]:border-navy data-[state=active]:text-navy",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-5 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
