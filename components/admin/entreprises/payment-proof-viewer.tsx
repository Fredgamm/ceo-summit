"use client";

import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Volet latéral (3 septembre 2026) — remplace le lien "ouvrir dans un nouvel onglet" par un aperçu inline, sans quitter la revue de paiement. */
export function PaymentProofViewer({ url, fileName }: { url: string; fileName: string }) {
  const isPdf = fileName.toLowerCase().endsWith(".pdf");

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Voir la preuve de paiement
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Preuve de paiement</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-auto rounded-md border border-border bg-surface">
          {isPdf ? (
            <iframe src={url} title="Preuve de paiement" className="h-full min-h-[70vh] w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- URL signée/dev, source dynamique non connue de next/image
            <img src={url} alt="Preuve de paiement" className="w-full" />
          )}
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-mid"
        >
          Ouvrir dans un nouvel onglet <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </SheetContent>
    </Sheet>
  );
}
