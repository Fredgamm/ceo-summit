"use client";

import * as React from "react";
import type { PaymentMethod } from "@prisma/client";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Retour de test du 23 oct. 2026 — pour un virement ou un chèque, l'entreprise
 * doit savoir à qui payer avant de joindre sa preuve. Coordonnées recopiées
 * du RIB BECOM (BRED Madagasikara) : à mettre à jour ici si le compte change.
 */
export const BECOM_BANK_ACCOUNT = {
  holder: "BECOM",
  bank: "BRED Madagasikara BP",
  rib: "00008 00001 05003028189 89",
  iban: "MG46 0000 8000 0105 0030 2818 989",
  bic: "BFAVMGMGXXX",
} as const;

export function BankDetails({
  method,
  className,
}: {
  /** Rien à afficher pour carte / Mobile Money : le paiement se fait chez Evolia. */
  method: PaymentMethod;
  className?: string;
}) {
  const account = BECOM_BANK_ACCOUNT;

  if (method !== "VIREMENT" && method !== "CHEQUE") return null;

  if (method === "CHEQUE") {
    return (
      <p
        className={cn(
          "rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-mid",
          className
        )}
      >
        Libellez votre chèque à l&apos;ordre de{" "}
        <strong className="font-semibold text-navy">{account.holder}</strong>, puis joignez-en la
        photo ci-dessous.
      </p>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-surface text-sm", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border px-4 py-2.5">
        <p className="font-semibold text-navy">Virement à l&apos;ordre de {account.holder}</p>
        <p className="text-xs text-text-muted">{account.bank}</p>
      </div>
      <dl className="divide-y divide-border">
        <BankRow label="IBAN" value={account.iban} />
        <BankRow label="BIC" value={account.bic} />
        <BankRow label="RIB" value={account.rib} />
      </dl>
      <p className="border-t border-border px-4 py-2.5 text-xs text-text-muted">
        Indiquez le nom de votre entreprise en référence du virement.
      </p>
    </div>
  );
}

function BankRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    try {
      // Sans espaces : c'est ce qu'attendent les formulaires de banque en ligne.
      await navigator.clipboard.writeText(value.replace(/\s+/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papier indisponible (contexte non sécurisé) : la valeur reste sélectionnable.
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <dt className="w-10 shrink-0 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-all font-medium tabular-nums text-navy select-all">
        {value}
      </dd>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? `${label} copié` : `Copier le ${label}`}
        title={copied ? "Copié" : "Copier"}
        className={cn(
          "shrink-0 rounded-md p-1.5 transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
          copied ? "text-emerald-600" : "text-text-muted hover:bg-navy-light/40 hover:text-navy"
        )}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
