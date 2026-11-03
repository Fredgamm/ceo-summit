"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // Rapport QA du 7 oct. 2026 (§3.6) — les onglets ne doivent pas élargir la
      // page sur mobile. 3 nov. 2026 : la ligne unique qui défile (21 oct.) coupait
      // les derniers onglets (« Mes créneaux », « Mes rendez-vous ») sans rien
      // indiquer : ils passent à la ligne et se partagent la largeur, tous visibles.
      // Sur mobile chaque ligne a sa propre base (bordure des onglets) ; à partir
      // de md, une seule ligne de base sous la liste, comme avant.
      "flex flex-wrap items-stretch md:items-center md:shadow-[inset_0_-2px_0_0_hsl(var(--border))]",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "grow whitespace-nowrap border-b-2 border-border px-3 py-2.5 text-center text-sm font-semibold text-muted-foreground transition-colors data-[state=active]:border-navy data-[state=active]:text-navy sm:px-5 md:grow-0 md:border-transparent md:text-left",
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
