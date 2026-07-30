import Link from "next/link";
import Image from "next/image";

/**
 * EX-T01 (audit du 29 juillet 2026) — aucune page 404 brandée n'existait :
 * chaque `notFound()` (nombreux gates de tier dans ce projet) rendait le
 * 404 générique de Next.js, hors design, sans navigation.
 *
 * Volontairement statique (pas d'appel à auth()) : ce fichier partage le
 * même arbre de rendu que toutes les routes, et un appel à une fonction
 * dynamique ici avait basculé /login, /demande-acces etc. en rendu
 * dynamique alors qu'elles étaient statiques — régression de perf
 * découverte en vérifiant le build. middleware.ts renvoie de toute façon
 * un membre déjà connecté de /login vers /dashboard, donc ce lien reste
 * correct dans les deux cas.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy p-6 text-center">
      <Image
        src="/logo/ceo-summit-logo-dark.png"
        alt="CEO Summit"
        width={180}
        height={86}
        className="mb-8"
      />
      <h1 className="mb-2 text-xl font-bold text-white">Page introuvable</h1>
      <p className="mb-6 max-w-sm text-sm text-white/60">
        Cette page n&apos;existe pas ou n&apos;est plus disponible.
      </p>
      <Link href="/login" className="rounded-md bg-gold px-5 py-2.5 text-sm font-bold text-navy">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
