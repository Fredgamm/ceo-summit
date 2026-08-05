import { prisma } from "@/lib/prisma";

export type ReferentialType = "sector" | "country" | "opportunity_type";

/**
 * E8-T11 (5 août 2026) — source unique des libellés secteur/pays/type
 * d'opportunité, lue depuis le référentiel admin-éditable (`Referential`,
 * existait mais n'était consommé par aucune page jusqu'ici — voir
 * app/admin/parametres/page.tsx). Remplace les tableaux statiques
 * `lib/sectors.ts`/`lib/countries.ts` (supprimés) et l'ex-enum Prisma
 * `OpportunityType` (retiré, voir la migration
 * 20260805..._opportunity_type_to_referential).
 */
export async function getReferentialLabels(type: ReferentialType): Promise<string[]> {
  const rows = await prisma.referential.findMany({
    where: { type },
    orderBy: { position: "asc" },
    select: { label: true },
  });
  return rows.map((r) => r.label);
}

export async function isValidReferentialLabel(
  type: ReferentialType,
  label: string
): Promise<boolean> {
  const found = await prisma.referential.findFirst({ where: { type, label } });
  return found !== null;
}
