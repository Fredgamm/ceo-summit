"use client";

import * as React from "react";

import { applyQuickReason } from "@/lib/meeting-request-ui";
import { MEETING_RESPONSE_MESSAGE_MAX } from "@/lib/meeting-booking";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Module 21 (3 nov. 2026) — mot facultatif laissé en répondant à une demande
 * de rendez-vous : quelques réponses toutes prêtes à toucher, puis un champ
 * libre. Utilisé dans « Mes rendez-vous » (accepter, refuser) et sur la page
 * ouverte depuis l'email.
 */
export function ResponseMessageField({
  id,
  replies,
  value,
  onChange,
  disabled,
  placeholder = "Ou écrivez votre propre message…",
}: {
  id: string;
  replies: readonly { label: string; text: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Réponses proposées">
        {replies.map((r) => {
          const on = value.trim() === r.text;
          return (
            <button
              key={r.label}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() =>
                onChange(applyQuickReason(value, r.text, MEETING_RESPONSE_MESSAGE_MAX))
              }
              className={cn(
                "rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2 disabled:opacity-50",
                on
                  ? "border-navy bg-navy text-white"
                  : "border-navy/30 bg-white text-navy hover:border-navy"
              )}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <label htmlFor={id} className="sr-only">
        Votre message
      </label>
      <Textarea
        id={id}
        rows={3}
        maxLength={MEETING_RESPONSE_MESSAGE_MAX}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white"
      />
      <p className="text-right text-xs text-text-muted">
        {value.trim().length}/{MEETING_RESPONSE_MESSAGE_MAX}
      </p>
    </div>
  );
}
