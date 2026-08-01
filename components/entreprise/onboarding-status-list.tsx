import { Check } from "lucide-react";

import type { OnboardingStatusItem } from "@/lib/onboarding-status";
import { cn } from "@/lib/utils";

/** Parcours revu (1er août 2026) — checklist de statut affichée pendant la mise en place. */
export function OnboardingStatusList({ items }: { items: OnboardingStatusItem[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2.5 text-sm">
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
              item.done ? "border-navy bg-navy text-white" : "border-border bg-white"
            )}
          >
            {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
          <span className={item.done ? "text-navy" : "text-text-muted"}>{item.label}</span>
        </li>
      ))}
    </ol>
  );
}
