"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { companyFormSchema } from "@/lib/validations/company";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Phase 2 offres/paiement (30 juillet 2026) — le créateur devient admin
 * entreprise (rôle fonctionnel, indépendant de son titre réel — voir
 * conversation produit du 30 juillet 2026) et rejoint lui-même la fiche
 * (companyId). Réassignable ensuite via app/actions/admin-companies.ts.
 */
export async function createCompany(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const viewer = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!viewer) return { success: false, error: "Compte introuvable." };
  if (viewer.companyId) {
    return { success: false, error: "Votre compte est déjà rattaché à une entreprise." };
  }

  const parsed = companyFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const f = parsed.data;

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({
      data: {
        name: f.name,
        sector: f.sector,
        country: f.country,
        description: f.description || null,
        website: f.website || null,
        companyAdminId: viewer.id,
      },
    });
    await tx.user.update({ where: { id: viewer.id }, data: { companyId: created.id } });
    return created;
  });

  revalidatePath("/entreprise");
  revalidatePath("/dashboard");
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
    data: {
      name: f.name,
      sector: f.sector,
      country: f.country,
      description: f.description || null,
      website: f.website || null,
    },
  });

  revalidatePath(`/entreprises/${companyId}`);
  revalidatePath("/entreprise");
  return { success: true, data: undefined };
}
