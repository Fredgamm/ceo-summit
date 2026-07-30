import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

/**
 * B1 (audit RGPD du 29 juillet 2026) — même statut que /confidentialite :
 * page créée pour éviter un lien mort depuis /demande-acces, contenu à
 * finaliser avec un conseil juridique.
 */
export default function TermsOfUsePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/demande-acces" className="mb-6 inline-block text-sm text-text-muted">
        ← Retour
      </Link>

      <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Brouillon — cette page n&apos;a pas encore été validée par un conseil juridique. Ne pas
        considérer comme définitive.
      </div>

      <h1 className="mb-6 text-2xl font-bold text-navy">Conditions d&apos;utilisation</h1>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-text-mid">
        <section>
          <h2 className="mb-2 text-base font-bold text-navy">Accès à la plateforme</h2>
          <p>
            L&apos;accès à CEO Summit est réservé aux candidats approuvés par l&apos;équipe
            d&apos;administration, sous réserve du règlement de l&apos;adhésion correspondant au
            niveau de membership choisi.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-navy">Comportement attendu</h2>
          <p>
            Les membres s&apos;engagent à un usage professionnel et respectueux de la plateforme :
            Deal Room, salles thématiques, messagerie et catalogue de services. Tout comportement
            abusif peut entraîner un avertissement, une suspension ou une exclusion.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-navy">Résiliation</h2>
          <p>
            L&apos;adhésion est valable pour la durée souscrite. Son renouvellement n&apos;est pas
            automatique sans action du membre.
          </p>
        </section>
      </div>
    </div>
  );
}
