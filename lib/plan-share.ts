/**
 * UC-11 (5 août 2026) — lien profond partageable d'une offre self-service
 * (`/inscription?offre=<slug>`, voir app/inscription/page.tsx), utilisé à la
 * fois pour le bouton "Copier le lien" et la génération du QR code côté
 * admin (components/admin/plans/plan-share-button.tsx).
 */
export function getPlanShareUrl(slug: string): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}/inscription?offre=${slug}`;
}
