import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Politique de confidentialité" };

/**
 * B1 (audit RGPD du 29 juillet 2026) — page créée pour que le lien de
 * consentement sur /demande-acces ne soit pas mort. Structure réelle,
 * contenu à finaliser avec un conseil juridique avant mise en production —
 * voir AUDIT_SECURITE_CONFORMITE_ACCESSIBILITE.md §3 (RGPD) pour le détail
 * des traitements réels (candidature, messagerie chiffrée, paiement Evolia,
 * sous-traitants Resend/R2/Zoom).
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/demande-acces" className="mb-6 inline-block text-sm text-text-muted">
        ← Retour
      </Link>

      <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Brouillon — cette page décrit la structure réelle des traitements de données mais n&apos;a
        pas encore été validée par un conseil juridique. Ne pas considérer comme définitive.
      </div>

      <h1 className="mb-6 text-2xl font-bold text-navy">Politique de confidentialité</h1>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-text-mid">
        <section>
          <h2 className="mb-2 text-base font-bold text-navy">Données collectées</h2>
          <p>
            Nous collectons les données que vous nous transmettez lors de votre candidature (nom,
            fonction, entreprise, email, secteur, pays) et, une fois membre, les données de votre
            profil, vos messages privés (chiffrés au repos), vos inscriptions aux événements et vos
            échanges au sein de la Deal Room et des salles thématiques.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-navy">Finalité</h2>
          <p>
            Ces données servent à instruire votre candidature, gérer votre adhésion, vous mettre en
            relation avec les autres membres et vous informer des événements et opportunités
            pertinentes.
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-navy">Sous-traitants</h2>
          <p>
            Certains traitements sont confiés à des prestataires : Resend (envoi d&apos;emails),
            Cloudflare R2 (hébergement des fichiers), Evolia (paiement des adhésions et événements),
            Zoom (webinaires).
          </p>
        </section>
        <section>
          <h2 className="mb-2 text-base font-bold text-navy">Vos droits</h2>
          <p>
            Vous pouvez demander l&apos;accès, la rectification ou la suppression de vos données en
            contactant l&apos;équipe CEO Summit. Certaines données peuvent être conservées plus
            longtemps pour des raisons légales (facturation, litiges).
          </p>
        </section>
      </div>
    </div>
  );
}
