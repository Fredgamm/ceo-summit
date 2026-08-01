"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { companyFormSchema, createCompanyWithPlanSchema } from "@/lib/validations/company";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

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
 * Parcours revu (1er août 2026) — l'offre est choisie AVANT l'entreprise
 * (cas d'usage retenu), mais `CompanySubscription.companyId` exige que la
 * Company existe déjà : les deux sont donc créées ensemble, dans la même
 * transaction, à la toute fin de l'assistant — le choix d'offre ne reste
 * qu'un état d'assistant côté client jusque-là (voir
 * components/entreprise/company-onboarding-wizard.tsx), pas une écriture
 * séparée comme dans la première version de cette phase. Le créateur devient
 * admin entreprise (rôle fonctionnel, indépendant de son titre réel) et
 * rejoint lui-même la fiche (companyId). Réassignable ensuite via
 * app/actions/admin-companies.ts.
 */
export async function createCompany(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) return { success: false, error: "Compte introuvable." };
  if (viewer.companyId) {
    return { success: false, error: "Votre compte est déjà rattaché à une entreprise." };
  }

  const parsed = createCompanyWithPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  const plan = await prisma.plan.findUnique({ where: { id: f.planId } });
  if (!plan || !plan.isActive || plan.scope !== "COMPANY") {
    return { success: false, error: "Offre invalide." };
  }

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: { ...companyData(f), companyAdminId: viewer.id },
    });
    await tx.user.update({ where: { id: viewer.id }, data: { companyId: created.id } });
    await tx.companySubscription.create({
      data: { companyId: created.id, planId: plan.id, status: "PENDING_PAYMENT" },
    });
    return created;
  });

  revalidatePath("/entreprise");
  revalidatePath("/dashboard");
  revalidatePath("/paiement-en-attente");
  return { success: true, data: { id: company.id } };
}

export async function updateCompany(companyId: string, input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { success: false, error: "Entreprise introuvable." };
  if (company.companyAdminId !== session.user.id) {
    return { success: false, error: "Seul l'admin de l'entreprise peut modifier sa fiche." };
  }

  const parsed = companyFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  await prisma.company.update({
    where: { id: companyId },
    data: companyData(f),
  });

  revalidatePath(`/entreprises/${companyId}`);
  revalidatePath("/entreprise");
  return { success: true, data: undefined };
}
