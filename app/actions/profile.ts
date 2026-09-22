"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validations/profile";
import { getReferentialLabels } from "@/lib/referentials-query";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * E2-T02 — édition profil (`/profil/editer`). Photo upload is handled
 * separately by the /api/profile/avatar route (needs multipart/form-data +
 * server-side resize, which doesn't fit a Server Action's JSON-shaped input
 * well) — see lib/r2.ts.
 */
export async function updateProfile(input: unknown): Promise<ActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }
  const { name, title, bio, websiteUrl, linkedinUrl, country, sectors, phone } = parsed.data;

  // E8-T11 (5 août 2026) — `country`/`sectors` sont des référentiels
  // admin-éditables (lib/referentials-query.ts), plus des enums figés à la
  // compilation : vérifiés ici contre la liste actuelle.
  const [validCountries, validSectors] = await Promise.all([
    getReferentialLabels("country"),
    getReferentialLabels("sector"),
  ]);
  if (country && !validCountries.includes(country)) {
    return { success: false, error: "Pays invalide." };
  }
  if (sectors.some((s) => !validSectors.includes(s))) {
    return { success: false, error: "Secteur invalide." };
  }

  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      title,
      bio: bio || null,
      websiteUrl: websiteUrl || null,
      linkedinUrl: linkedinUrl || null,
      country: country || null,
      sectors,
      phone: phone || null,
    },
  });

  // /membres/[id] and /dashboard both read this row — keep them fresh.
  revalidatePath(`/membres/${session.user.id}`);
  revalidatePath("/dashboard");

  return { success: true, data: undefined };
}
