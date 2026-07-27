"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validations/profile";

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

  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Non authentifié." };

  const { name, title, bio, linkedinUrl, country, sectors } = parsed.data;
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      title: title || null,
      bio: bio || null,
      linkedinUrl: linkedinUrl || null,
      country: country || null,
      sectors,
    },
  });

  // /membres/[id] and /dashboard both read this row — keep them fresh.
  revalidatePath(`/membres/${session.user.id}`);
  revalidatePath("/dashboard");

  return { success: true, data: undefined };
}
