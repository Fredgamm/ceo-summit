"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  EVOLIA_SETTING_KEYS,
  PAYMENT_URL_PLACEHOLDER,
  encryptSetting,
  getEvoliaSettingsStatus,
  type EvoliaUrlField,
} from "@/lib/evolia-config";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

// Toute tentative compte, mot de passe faux compris : freine un essai de mots de passe.
const RATE_LIMIT = 5;
const RATE_WINDOW_SEC = 15 * 60;

/** Adresses internes refusées en production : l'adresse d'inscription est appelée par notre serveur. */
function isInternalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))
    return true;
  if (host.includes(":")) return host === "::1" || /^(fc|fd|fe80)/.test(host);
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function endpointSchema(label: string) {
  return z
    .string()
    .trim()
    .max(500, `${label} : 500 caractères maximum.`)
    .refine((value) => {
      if (value === "") return true;
      let url: URL;
      try {
        // Le modèle d'adresse de paiement contient {ceoSummitReference}, valide une fois remplacé.
        url = new URL(value.replace(PAYMENT_URL_PLACEHOLDER, "ref"));
      } catch {
        return false;
      }
      if (url.username || url.password) return false;
      if (process.env.NODE_ENV === "development" && url.protocol === "http:") {
        return isInternalHost(url.hostname);
      }
      return url.protocol === "https:" && !isInternalHost(url.hostname);
    }, `${label} : adresse https:// publique attendue.`);
}

const secretSchema = z
  .string()
  .max(256, "La clé ne doit pas dépasser 256 caractères.")
  .refine((value) => value === "" || /^\S{32,}$/.test(value), {
    message: "La clé doit contenir au moins 32 caractères, sans espace.",
  });

const evoliaSettingsSchema = z.object({
  registrationUrl: endpointSchema("Adresse d'inscription"),
  paymentUrl: endpointSchema("Adresse de paiement").refine(
    (value) => value === "" || value.includes(PAYMENT_URL_PLACEHOLDER),
    `Adresse de paiement : doit contenir ${PAYMENT_URL_PLACEHOLDER}.`
  ),
  secret: secretSchema,
  clearSecret: z.boolean(),
  currentPassword: z.string().min(1, "Confirmez avec votre mot de passe."),
});

export type EvoliaSettingsInput = z.infer<typeof evoliaSettingsSchema>;

const FIELD_LABEL: Record<EvoliaUrlField | "secret", string> = {
  registrationUrl: "adresse d'inscription",
  paymentUrl: "lien de paiement",
  secret: "clé Evolia",
};

/**
 * 21 oct. 2026 — enregistre la configuration Evolia (Paramètres ›
 * Intégrations). Réservé SUPER_ADMIN (section "parametres") et confirmé par
 * le mot de passe : ces réglages décident où partent les données des
 * participants et quels paiements sont acceptés comme confirmés.
 */
export async function updateEvoliaSettings(
  input: EvoliaSettingsInput
): Promise<ActionResult<{ changed: string[] }>> {
  const { userId } = await requireAdmin("parametres");

  const rateLimit = await checkRateLimit(
    `admin:evolia-settings:${userId}`,
    RATE_LIMIT,
    RATE_WINDOW_SEC
  );
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${Math.ceil(rateLimit.retryAfterSec / 60)} min.`,
    };
  }

  const parsed = evoliaSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const data = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user?.passwordHash || !(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
    return { success: false, error: "Mot de passe incorrect." };
  }

  const current = await getEvoliaSettingsStatus();
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const changed: (EvoliaUrlField | "secret")[] = [];

  for (const field of ["registrationUrl", "paymentUrl"] as const) {
    const key = EVOLIA_SETTING_KEYS[field];
    const value = data[field];
    if (value === "") {
      if (current[field].source === "admin") {
        writes.push(prisma.platformSetting.deleteMany({ where: { key } }));
        changed.push(field);
      }
    } else if (value !== current[field].value) {
      // Valeur identique à l'actuelle (y compris celle de l'environnement) : rien à figer en base.
      writes.push(
        prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
      );
      changed.push(field);
    }
  }

  const secretKey = EVOLIA_SETTING_KEYS.secret;
  if (data.secret) {
    const value = encryptSetting(data.secret, secretKey);
    writes.push(
      prisma.platformSetting.upsert({
        where: { key: secretKey },
        create: { key: secretKey, value },
        update: { value },
      })
    );
    changed.push("secret");
  } else if (data.clearSecret && (current.secret.source === "admin" || current.secret.unreadable)) {
    writes.push(prisma.platformSetting.deleteMany({ where: { key: secretKey } }));
    changed.push("secret");
  }

  if (changed.length === 0) return { success: true, data: { changed: [] } };

  await prisma.$transaction([
    ...writes,
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "settings.evolia.update",
        targetType: "PlatformSetting",
        targetId: "evolia",
        // Jamais les clés elles-mêmes : seulement ce qui a changé.
        metadata: {
          changed,
          ...(changed.includes("registrationUrl")
            ? { registrationUrl: data.registrationUrl || null }
            : {}),
          ...(changed.includes("paymentUrl") ? { paymentUrl: data.paymentUrl || null } : {}),
        },
      },
    }),
  ]);

  revalidatePath("/admin/parametres");
  return { success: true, data: { changed: changed.map((f) => FIELD_LABEL[f]) } };
}
