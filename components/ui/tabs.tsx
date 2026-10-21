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
      // page sur mobile. 21 oct. 2026 : une seule ligne qui défile (barre masquée)
      // plutôt qu'un passage à la ligne, retour à la ligne à partir de md.
      // Ligne de base en ombre intérieure, pas en bordure : avec le défilement,
      // le -mb-0.5 des onglets (soulignement posé sur la bordure) serait rogné.
      "flex flex-nowrap items-center overflow-x-auto shadow-[inset_0_-2px_0_0_hsl(var(--border))] [scrollbar-width:none] md:flex-wrap [&::-webkit-scrollbar]:hidden",
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
