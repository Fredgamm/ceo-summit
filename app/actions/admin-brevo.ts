"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { confirmAdminPassword } from "@/lib/admin-reauth";
import { encryptSetting } from "@/lib/settings-crypto";
import {
  BREVO_SETTING_KEYS,
  BrevoError,
  getBrevoAccount,
  getBrevoConfig,
  type BrevoAccountStatus,
} from "@/lib/brevo";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

const brevoSettingsSchema = z.object({
  // Clés Brevo : « xkeysib-… » ; vide = conserver la clé actuelle.
  apiKey: z
    .string()
    .trim()
    .max(200, "La clé ne doit pas dépasser 200 caractères.")
    .refine((value) => value === "" || /^\S{20,}$/.test(value), {
      message: "Clé d'API Brevo invalide (au moins 20 caractères, sans espace).",
    }),
  clearApiKey: z.boolean(),
  senderEmail: z
    .string()
    .trim()
    .max(200)
    .refine((value) => value === "" || z.string().email().safeParse(value).success, {
      message: "Adresse d'expéditeur invalide.",
    }),
  senderName: z.string().trim().max(100, "Nom d'expéditeur : 100 caractères maximum."),
  currentPassword: z.string(),
});

export type BrevoSettingsInput = z.infer<typeof brevoSettingsSchema>;

/**
 * 21 oct. 2026 — enregistre la configuration Brevo des communications
 * (Paramètres › Intégrations). Même protections que la configuration Evolia :
 * super admin, mot de passe, tentatives limitées, clé chiffrée, journal
 * d'audit sans la clé.
 */
export async function updateBrevoSettings(
  input: BrevoSettingsInput
): Promise<ActionResult<{ changed: string[] }>> {
  const { userId } = await requireAdmin("parametres");

  const parsed = brevoSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const data = parsed.data;

  const passwordError = await confirmAdminPassword(userId, "brevo-settings", data.currentPassword);
  if (passwordError) return { success: false, error: passwordError };

  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: Object.values(BREVO_SETTING_KEYS) } },
  });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const changed: string[] = [];

  const upsert = (key: string, value: string) =>
    prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });

  if (data.apiKey) {
    writes.push(
      upsert(BREVO_SETTING_KEYS.apiKey, encryptSetting(data.apiKey, BREVO_SETTING_KEYS.apiKey))
    );
    changed.push("clé d'API");
  } else if (data.clearApiKey && stored.has(BREVO_SETTING_KEYS.apiKey)) {
    writes.push(prisma.platformSetting.deleteMany({ where: { key: BREVO_SETTING_KEYS.apiKey } }));
    changed.push("clé d'API");
  }

  for (const [field, key, label] of [
    ["senderEmail", BREVO_SETTING_KEYS.senderEmail, "adresse d'expéditeur"],
    ["senderName", BREVO_SETTING_KEYS.senderName, "nom d'expéditeur"],
  ] as const) {
    const value = data[field];
    if (value === (stored.get(key) ?? "")) continue;
    writes.push(value ? upsert(key, value) : prisma.platformSetting.deleteMany({ where: { key } }));
    changed.push(label);
  }

  if (changed.length === 0) return { success: true, data: { changed: [] } };

  await prisma.$transaction([
    ...writes,
    prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "settings.brevo.update",
        targetType: "PlatformSetting",
        targetId: "brevo",
        // Jamais la clé elle-même.
        metadata: {
          changed,
          ...(changed.includes("adresse d'expéditeur")
            ? { senderEmail: data.senderEmail || null }
            : {}),
        },
      },
    }),
  ]);

  revalidatePath("/admin/parametres");
  revalidatePath("/admin/communications");
  return { success: true, data: { changed } };
}

/** Bouton « Tester la connexion » : la clé enregistrée est-elle acceptée, et combien de crédits reste-t-il ? */
export async function testBrevoConnection(): Promise<ActionResult<BrevoAccountStatus>> {
  await requireAdmin("parametres");
  const config = await getBrevoConfig();
  if (!config.apiKey) {
    return { success: false, error: "Aucune clé d'API Brevo n'est enregistrée." };
  }
  try {
    return { success: true, data: await getBrevoAccount(config.apiKey) };
  } catch (err) {
    return {
      success: false,
      error: err instanceof BrevoError ? err.message : "Brevo injoignable pour le moment.",
    };
  }
}
