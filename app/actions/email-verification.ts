"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/require-viewer";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmailVerification } from "@/lib/email-verification";
import { emailSchema } from "@/lib/validations/auth";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const RESEND_LIMIT_PER_HOUR = 5;
const RATE_LIMITED_ERROR =
  "Trop d'envois en peu de temps. Patientez quelques minutes avant de réessayer.";
const SEND_FAILED_ERROR =
  "L'e-mail n'a pas pu être envoyé. Réessayez dans un instant ou contactez l'équipe CEO Summit.";

/**
 * 14 oct. 2026 — renvoie le lien de confirmation d'adresse (écran
 * « Confirmez votre adresse e-mail » de /entreprise/paiement).
 */
export async function resendEmailVerification(): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  if (viewer.emailVerifiedAt) return { success: true, data: undefined };

  const rateLimit = await checkRateLimit(
    `email-verification:${viewer.id}`,
    RESEND_LIMIT_PER_HOUR,
    60 * 60
  );
  if (!rateLimit.allowed) return { success: false, error: RATE_LIMITED_ERROR };

  const sent = await sendEmailVerification(viewer);
  return sent ? { success: true, data: undefined } : { success: false, error: SEND_FAILED_ERROR };
}

/**
 * 14 oct. 2026 — corrige l'adresse saisie à l'inscription (faute de frappe)
 * et envoie le lien à la nouvelle. Réservé à une adresse encore non
 * confirmée : une adresse confirmée ne se change pas depuis cet écran.
 */
export async function changeUnverifiedEmail(rawEmail: unknown): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  if (viewer.emailVerifiedAt) {
    return { success: false, error: "Votre adresse est déjà confirmée." };
  }

  const parsed = emailSchema.safeParse(typeof rawEmail === "string" ? rawEmail.trim() : rawEmail);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Adresse email invalide" };
  }
  const email = parsed.data.toLowerCase();
  if (email === viewer.email) return resendEmailVerification();

  const rateLimit = await checkRateLimit(
    `email-verification:${viewer.id}`,
    RESEND_LIMIT_PER_HOUR,
    60 * 60
  );
  if (!rateLimit.allowed) return { success: false, error: RATE_LIMITED_ERROR };

  try {
    await prisma.user.update({ where: { id: viewer.id }, data: { email } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, error: "Cette adresse est déjà utilisée par un autre compte." };
    }
    throw err;
  }
  await prisma.auditLog.create({
    data: {
      actorId: viewer.id,
      action: "user.email.change_unverified",
      targetType: "User",
      targetId: viewer.id,
      metadata: { from: viewer.email, to: email },
    },
  });

  revalidatePath("/entreprise/paiement");
  const sent = await sendEmailVerification({ ...viewer, email });
  return sent ? { success: true, data: undefined } : { success: false, error: SEND_FAILED_ERROR };
}
