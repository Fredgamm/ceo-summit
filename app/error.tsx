"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";

/**
 * EX-T01 (audit du 29 juillet 2026) — même constat que not-found.tsx :
 * aucune frontière d'erreur brandée n'existait, une exception serveur
 * affichait l'écran générique de Next.js. Doit être un Client Component
 * (contrainte Next.js App Router).
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy p-6 text-center">
      <Image
        src="/logo/ceo-summit-logo-dark.png"
        alt="CEO Summit"
        width={180}
        height={86}
        className="mb-8"
      />
      <h1 className="mb-2 text-xl font-bold text-white">Une erreur est survenue</h1>
      <p className="mb-6 max-w-sm text-sm text-white/60">
        Quelque chose s&apos;est mal passé. Réessayez, ou revenez au tableau de bord si le problème
        persiste.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-gold px-5 py-2.5 text-sm font-bold text-navy"
        >
          Réessayer
        </button>
        <Link
          href="/dashboard"
          className="rounded-md border border-white/20 px-5 py-2.5 text-sm font-bold text-white"
        >
          Tableau de bord
        </Link>
      </div>
    </div>
  );
}
