"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PHONE_COUNTRIES } from "@/lib/phone-countries";

/**
 * 5 nov. 2026 — téléphone avec liste déroulante d'indicatifs pays. Composant
 * contrôlé : le parent garde l'indicatif (code ISO) et le numéro national.
 */
export function PhoneInput({
  id,
  countryIso,
  onCountryChange,
  number,
  onNumberChange,
  placeholder = "34 12 345 67",
}: {
  id?: string;
  countryIso: string;
  onCountryChange: (iso: string) => void;
  number: string;
  onNumberChange: (value: string) => void;
  placeholder?: string;
}) {
  const current = PHONE_COUNTRIES.find((c) => c.iso === countryIso);

  return (
    <div className="flex gap-2">
      <Select value={countryIso} onValueChange={onCountryChange}>
        <SelectTrigger aria-label="Indicatif du pays" className="w-28 shrink-0">
          <SelectValue>{current ? `${current.iso} ${current.dial}` : "Indicatif"}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {/* Océan Indien et France d'abord, puis les autres pays (lib/phone-countries). */}
          {PHONE_COUNTRIES.map((c) => (
            <SelectItem key={c.iso} value={c.iso}>
              {c.name} ({c.dial})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={number}
        onChange={(e) => onNumberChange(e.target.value.replace(/[^\d\s()-]/g, ""))}
        maxLength={20}
        className="min-w-0 flex-1"
      />
    </div>
  );
}
