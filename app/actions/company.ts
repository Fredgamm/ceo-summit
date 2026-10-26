"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { canManageCompany } from "@/lib/staff-organization";
import { requireViewer } from "@/lib/require-viewer";
import { isPublicObjectUrlUnderPrefix } from "@/lib/r2";
import { companyFormSchema } from "@/lib/validations/company";
import { getReferentialLabels } from "@/lib/referentials-query";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * E8-T11 (5 août 2026) — `sector`/`country` sont des référentiels
 * admin-éditables (lib/referentials-query.ts), plus des enums figés à la
 * compilation : vérifiés ici contre la liste actuelle, partagé entre
 * `createCompany` et `updateCompany` (même contrainte dans les deux cas).
 */
export async function validateSectorAndCountry(
  sector: string,
  country: string
): Promise<string | null> {
  const [validSectors, validCountries] = await Promise.all([
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
  ]);
  if (!validSectors.includes(sector)) return "Secteur invalide.";
  if (!validCountries.includes(country)) return "Pays invalide.";
  return null;
}

function companyData(f: {
  name: string;
  sector: string;
  country: string;
  description: string;
  website: string;
  logoUrl: string;
  phone: string;
  address: string;
  linkedinUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  additionalInfo: string;
}) {
  const socialLinks: Record<string, string> = {};
  if (f.linkedinUrl) socialLinks.linkedin = f.linkedinUrl;
  if (f.facebookUrl) socialLinks.facebook = f.facebookUrl;
  if (f.instagramUrl) socialLinks.instagram = f.instagramUrl;

  return {
    name: f.name,
    sector: f.sector,
    country: f.country,
    description: f.description || null,
    website: f.website || null,
    logoUrl: f.logoUrl || null,
    phone: f.phone || null,
    address: f.address || null,
    additionalInfo: f.additionalInfo || null,
    socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
  };
}

/**
 * Audit (25 septembre 2026) — `logoUrl` était enregistré tel que soumis par
 * le client (n'importe quelle URL, y compris un domaine tiers ou un schéma
 * `javascript:` affiché ensuite en `<img src>`). Seule une URL produite par
 * `/api/company/logo` pour l'appelant (`company-logos/<userId>/`) est
 * acceptée — ou le logo déjà enregistré sur la fiche, inchangé (il peut
 * avoir été uploadé par un gestionnaire précédent).
 */
function isAcceptedLogoUrl(logoUrl: string, viewerId: string, currentLogoUrl?: string | null) {
  if (!logoUrl) return true;
  if (currentLogoUrl && logoUrl === currentLogoUrl) return true;
  return isPublicObjectUrlUnderPrefix(
    logoUrl,
    process.env.R2_BUCKET_AVATARS ?? "ceo-summit-avatars",
    `company-logos/${viewerId}/`
  );
}

const INVALID_LOGO_ERROR = "Logo invalide — importez-le à nouveau.";

/**
 * Parcours re-revu (5 août 2026) — l'entreprise est créée AVANT le choix
 * d'une offre (ordre inversé par rapport à la version du 1er août) :
 * demander une offre avant même que l'entreprise existe arrivait trop tôt
 * dans le parcours réel, et un formulaire entreprise plus long mérite
 * d'être sauvegardé dès sa soumission plutôt que de dépendre d'un état
 * d'assistant côté client perdu à la moindre navigation. La Company est
 * donc créée seule ici (aucune offre requise) ; l'utilisateur choisit et
 * paie son offre ensuite sur `/entreprise/paiement`, qui gère déjà le cas
 * "aucun abonnement" (voir ce fichier) — `selectPlan`
 * (app/actions/company-subscription.ts) crée la `CompanySubscription` à ce
 * moment-là, pas ici. Le créateur devient admin entreprise (rôle
 * fonctionnel, indépendant de son titre réel) et rejoint lui-même la fiche
 * (companyId). Réassignable ensuite via app/actions/admin-companies.ts.
 */
export async function createCompany(input: unknown): Promise<ActionResult<{ id: string }>> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  if (viewer.companyId) {
    return { success: false, error: "Votre compte est déjà rattaché à une entreprise." };
  }

  const parsed = companyFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  if (!isAcceptedLogoUrl(f.logoUrl, viewer.id)) {
    return { success: false, error: INVALID_LOGO_ERROR };
  }

  const referentialError = await validateSectorAndCountry(f.sector, f.country);
  if (referentialError) return { success: false, error: referentialError };

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: { ...companyData(f), companyAdminId: viewer.id },
    });
    await tx.user.update({ where: { id: viewer.id }, data: { companyId: created.id } });
    return created;
  });

  revalidatePath("/entreprise");
  revalidatePath("/dashboard");
  revalidatePath("/paiement-en-attente");
  return { success: true, data: { id: company.id } };
}

export async function updateCompany(companyId: string, input: unknown): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (!(await canManageCompany(viewer, company))) {
    return { success: false, error: "Seul l'admin de l'entreprise peut modifier sa fiche." };
  }

  const parsed = companyFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;
  if (!isAcceptedLogoUrl(f.logoUrl, viewer.id, company.logoUrl)) {
    return { success: false, error: INVALID_LOGO_ERROR };
  }

  const referentialError = await validateSectorAndCountry(f.sector, f.country);
  if (referentialError) return { success: false, error: referentialError };

  await prisma.company.update({
    where: { id: companyId },
    data: companyData(f),
  });

  revalidatePath(`/entreprises/${companyId}`);
  revalidatePath("/entreprise");
  return { success: true, data: undefined };
}
