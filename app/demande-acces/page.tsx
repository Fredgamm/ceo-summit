import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Diamond, CalendarDays, Users, LineChart } from "lucide-react";

import { getReferentialLabels } from "@/lib/referentials-query";
import { ApplicationForm } from "@/components/auth/application-form";

export const metadata: Metadata = { title: "Demander l'accès" };

/**
 * E8-T11 (5 août 2026) — cette page lisait jusqu'ici des tableaux statiques
 * (secteur/pays), ce qui permettait sa génération 100% statique (voir
 * AUDIT_SECURITE_CONFORMITE_ACCESSIBILITE.md sur l'importance de garder
 * `/demande-acces` statique). Elle lit maintenant les référentiels en base
 * — revalidation ISR toutes les heures plutôt qu'un rendu dynamique à
 * chaque requête, pour rester proche de la performance d'une page statique
 * (le contenu ne dépend d'aucune donnée de requête, cookies/session).
 */
export const revalidate = 3600;

const PILLARS = [
  {
    icon: Diamond,
    title: "Deal Room privé",
    text: "Opportunités d'affaires exclusives : partenariats, investissements, acquisitions",
  },
  {
    icon: CalendarDays,
    title: "Événements premium",
    text: "Summit annuel, dîners privés, rencontres B2B sur invitation",
  },
  {
    icon: Users,
    title: "Cercle de confiance",
    text: "Accès au réseau des dirigeants de l'Océan Indien",
  },
  {
    icon: LineChart,
    title: "Intelligence économique",
    text: "Rapports, analyses, tendances et opportunités régionales",
  },
];

/**
 * B1 (audit sécurité/conformité du 29 juillet 2026) — /demande-acces
 * n'existait pas alors que login-form.tsx y renvoie et que middleware.ts le
 * déclare public : le seul canal d'acquisition de nouveaux membres était
 * cassé. Layout aligné sur wireframe/demande-acces.html.
 */
export default async function RequestAccessPage() {
  const [sectors, countries] = await Promise.all([
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
  ]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="hidden w-[42%] flex-col justify-between bg-navy p-12 md:flex">
        <div>
          <Image
            src="/logo/ceo-summit-logo-dark.png"
            alt="CEO Summit"
            width={180}
            height={86}
            className="mb-2"
          />
          <div className="text-xs uppercase tracking-wide text-white/50">
            Océan Indien · Cercle des Décideurs
          </div>
        </div>

        <ul className="flex flex-col gap-5">
          {PILLARS.map((p) => (
            <li key={p.title} className="flex items-start gap-3.5">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/15">
                <p.icon className="h-4 w-4 text-gold" />
              </div>
              <div>
                <strong className="block text-[13.5px] font-bold text-white">{p.title}</strong>
                <span className="text-xs leading-relaxed text-white/55">{p.text}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-l-2 border-gold pl-4">
          <p className="text-[13px] italic leading-relaxed text-white/70">
            « CEO Summit m&apos;a permis de conclure deux partenariats stratégiques en six mois. La
            qualité du réseau est incomparable dans notre région. »
          </p>
          <cite className="text-xs font-bold text-gold">
            Sarah Razanamahery — DG, BNI Madagascar · Chairman
          </cite>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto bg-surface p-6 md:p-10">
        <div className="w-full max-w-[560px]">
          <Link href="/login" className="mb-6 inline-block text-sm text-text-muted">
            ← Retour à la connexion
          </Link>

          <div className="mb-6">
            <h1 className="mb-1.5 text-2xl font-bold text-navy">Demander l&apos;accès au cercle</h1>
            <p className="text-sm text-text-mid">
              Votre candidature sera examinée par notre équipe. Réponse sous 48–72h ouvrées.
            </p>
          </div>

          <ApplicationForm sectors={sectors} countries={countries} />
        </div>
      </div>
    </div>
  );
}
