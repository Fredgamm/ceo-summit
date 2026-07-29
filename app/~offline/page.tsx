import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = { title: "Hors ligne" };

/**
 * E9-T01 — fallback document served by the service worker
 * (next.config.mjs `fallbacks.document`) when a page isn't already cached
 * and the network request fails. Must render with zero data fetching —
 * there is no network by definition when this shows.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy p-6 text-center">
      <Image
        src="/logo/ceo-summit-logo-dark.png"
        alt="CEO Summit"
        width={180}
        height={86}
        className="mb-8"
      />
      <h1 className="mb-2 text-xl font-bold text-white">Vous êtes hors ligne</h1>
      <p className="max-w-sm text-sm text-white/60">
        Cette page n&apos;est pas disponible sans connexion. Vérifiez votre réseau puis réessayez —
        les pages déjà consultées restent accessibles hors ligne.
      </p>
    </div>
  );
}
