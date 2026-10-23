"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { confirmAdminPassword } from "@/lib/admin-reauth";
import { startEvoliaReleaseInBackground } from "@/lib/evolia";
import {
  EVOLIA_SETTING_KEYS,
  PAYMENT_URL_PLACEHOLDER,
  encryptSetting,
  getEvoliaSettingsStatus,
  isEvoliaLive,
  type EvoliaUrlField,
} from "@/lib/evolia-config";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

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
  /** 23 oct. 2026 — clé de production validée : envois et carte / Mobile Money activés. */
  live: z.boolean(),
  currentPassword: z.string().min(1, "Confirmez avec votre mot de passe."),
});

export type EvoliaSettingsInput = z.infer<typeof evoliaSettingsSchema>;

const FIELD_LABEL: Record<EvoliaUrlField | "secret" | "live", string> = {
  registrationUrl: "adresse d'inscription",
  paymentUrl: "lien de paiement",
  secret: "clé Evolia",
  live: "activation d'Evolia",
};

/**
 * 21 oct. 2026 — enregistre la configuration Evolia (Paramètres ›
 * Intégrations). Réservé SUPER_ADMIN (section "parametres") et confirmé par
 * le mot de passe : ces réglages décident où partent les données des
 * participants et quels paiements sont acceptés comme confirmés.
 */
export async function updateEvoliaSettings(input: EvoliaSettingsInput): Promise<
  ActionResult<{
    changed: string[];
    /** Activation : la transmission des envois retenus est lancée en arrière-plan. */
    releaseStarted: boolean;
  }>
> {
  const { userId } = await requireAdmin("parametres");

  const parsed = evoliaSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const data = parsed.data;

  const passwordError = await confirmAdminPassword(userId, "evolia-settings", data.currentPassword);
  if (passwordError) return { success: false, error: passwordError };

  const current = await getEvoliaSettingsStatus();
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const changed: (EvoliaUrlField | "secret" | "live")[] = [];

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

  // Activer sans clé ferait échouer tous les envois retenus d'un coup.
  const hasKeyAfterSave = data.secret
    ? true
    : data.clearSecret && current.secret.source === "admin"
      ? Boolean(process.env.EVOLIA_WEBHOOK_SECRET)
      : current.secret.source !== "none" && !current.secret.unreadable;
  // Evolia activé (déjà ou à l'instant) sans clé : tous les envois échoueraient
  // et la carte serait proposée sans pouvoir aboutir.
  if (data.live && !hasKeyAfterSave) {
    return {
      success: false,
      error: "Enregistrez d'abord la clé Evolia de production avant d'activer Evolia.",
    };
  }

  if (data.live !== current.live) {
    const liveKey = EVOLIA_SETTING_KEYS.live;
    writes.push(
      data.live
        ? prisma.platformSetting.upsert({
            where: { key: liveKey },
            create: { key: liveKey, value: "true" },
            update: { value: "true" },
          })
        : prisma.platformSetting.deleteMany({ where: { key: liveKey } })
    );
    changed.push("live");
  }

  if (changed.length === 0) return { success: true, data: { changed: [], releaseStarted: false } };

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
          ...(changed.includes("live") ? { live: data.live } : {}),
        },
      },
    }),
  ]);

  // Activation : tout ce qui a été retenu part maintenant chez Evolia.
  const releaseStarted = changed.includes("live") && data.live;
  if (releaseStarted) startEvoliaReleaseInBackground(userId);

  revalidatePath("/admin/parametres");
  revalidatePath("/entreprise/paiement");
  return {
    success: true,
    data: { changed: changed.map((f) => FIELD_LABEL[f]), releaseStarted },
  };
}

/**
 * 23 oct. 2026 — retransmet, en arrière-plan, les envois encore retenus une
 * fois Evolia activé, et réessaie les inscriptions en échec (sans quoi les
 * listes de ces entreprises resteraient bloquées).
 */
export async function transmitHeldEvoliaPushes(): Promise<ActionResult> {
  const { userId } = await requireAdmin("parametres");
  if (!(await isEvoliaLive())) {
    return { success: false, error: "Evolia n'est pas activé : les envois restent retenus." };
  }
  startEvoliaReleaseInBackground(userId, { retryFailedRegistrations: true });
  return { success: true, data: undefined };
}
