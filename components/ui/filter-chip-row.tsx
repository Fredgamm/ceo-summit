"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export const FILTER_CHIP_CLASS =
  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_ON = "border-navy bg-navy text-white";
const CHIP_OFF = "border-border bg-white text-text-mid hover:border-navy-light";

/**
 * 14 oct. 2026 — rangée de filtres en puces, partagée par la liste des membres
 * et les salles. Mobile : une seule ligne qui défile (fondu au bord droit), le
 * filtre choisi ramené au centre ; bureau : puces sur plusieurs lignes.
 * `value` vide = « tout ».
 */
export function FilterChipRow({
  label,
  allLabel,
  options,
  value,
  onChange,
  trailing,
}: {
  label: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** Puce supplémentaire en fin de rangée (ex. recherche dans la liste complète). */
  trailing?: React.ReactNode;
}) {
  const rowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2 });
  }, [value]);

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label={label}
      className={cn(
        "relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "[mask-image:linear-gradient(to_right,#000_88%,transparent)]",
        "sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none]"
      )}
    >
      <button
        type="button"
        aria-pressed={!value}
        onClick={() => onChange("")}
        className={cn(FILTER_CHIP_CLASS, !value ? CHIP_ON : CHIP_OFF)}
      >
        {allLabel}
      </button>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(FILTER_CHIP_CLASS, value === option ? CHIP_ON : CHIP_OFF)}
        >
          {option}
        </button>
      ))}
      {trailing}
    </div>
  );
}
