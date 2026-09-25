"use server";

import { revalidatePath } from "next/cache";
import { render } from "@react-email/render";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { requireViewer } from "@/lib/require-viewer";
import {
  emailTemplateFormSchema,
  type EmailTemplateFormInput,
} from "@/lib/validations/email-template";
import {
  extractBlockVariableRefs,
  substituteBlocks,
  substituteVariables,
} from "@/lib/email-blocks";
import { getTemplateDefinition } from "@/lib/email-templates/registry";
import { DynamicEmail } from "@/emails/dynamic-email";
import { sendTransactionalEmail } from "@/lib/resend";

type ActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

/**
 * Bibliothèque d'emails transactionnels éditable (audit MVP, 25 septembre
 * 2026) — même forme que app/actions/admin-plans.ts : requireAdmin -> Zod ->
 * Prisma -> auditLog -> revalidatePath.
 */

/** Rejette toute {{variable}} qui n'est pas déclarée pour ce template —
 * erreur explicite à l'enregistrement plutôt qu'un {{typo}} littéral
 * envoyé en prod. */
function findUnknownVariables(input: EmailTemplateFormInput, allowedKeys: Set<string>): string[] {
  const refs = new Set<string>();
  for (const m of input.subject.matchAll(/\{\{(\w+)\}\}/g)) refs.add(m[1]);
  for (const block of input.blocks) {
    for (const ref of extractBlockVariableRefs(block)) refs.add(ref);
  }
  return [...refs].filter((ref) => !allowedKeys.has(ref));
}

export async function saveEmailTemplateOverride(
  key: string,
  input: unknown
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("emails");

  const definition = getTemplateDefinition(key);
  const parsed = emailTemplateFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }

  const allowedKeys = new Set(definition.variables.map((v) => v.key));
  const unknownVars = findUnknownVariables(parsed.data, allowedKeys);
  if (unknownVars.length > 0) {
    return {
      success: false,
      error: `Variable inconnue pour ce template : {{${unknownVars[0]}}}`,
    };
  }

  await prisma.emailTemplateOverride.upsert({
    where: { key },
    create: {
      key,
      category: definition.category,
      subject: parsed.data.subject,
      blocks: parsed.data.blocks,
      updatedById: adminId,
    },
    update: {
      subject: parsed.data.subject,
      blocks: parsed.data.blocks,
      updatedById: adminId,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "email-template.update",
      targetType: "EmailTemplateOverride",
      targetId: key,
    },
  });

  revalidatePath("/admin/emails");
  revalidatePath(`/admin/emails/${key}`);
  return { success: true, data: undefined };
}

export async function toggleEmailTemplateActive(
  key: string,
  isActive: boolean
): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("emails");
  const definition = getTemplateDefinition(key);

  await prisma.emailTemplateOverride.upsert({
    where: { key },
    create: { key, category: definition.category, isActive, updatedById: adminId },
    update: { isActive, updatedById: adminId },
  });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: isActive ? "email-template.activate" : "email-template.deactivate",
      targetType: "EmailTemplateOverride",
      targetId: key,
    },
  });

  revalidatePath("/admin/emails");
  return { success: true, data: undefined };
}

export async function resetEmailTemplateToDefault(key: string): Promise<ActionResult> {
  const { userId: adminId } = await requireAdmin("emails");
  getTemplateDefinition(key); // valide la clé avant d'écrire l'audit log

  await prisma.emailTemplateOverride.deleteMany({ where: { key } });
  await prisma.auditLog.create({
    data: {
      actorId: adminId,
      action: "email-template.reset",
      targetType: "EmailTemplateOverride",
      targetId: key,
    },
  });

  revalidatePath("/admin/emails");
  revalidatePath(`/admin/emails/${key}`);
  return { success: true, data: undefined };
}

/** Rendu HTML pour l'aperçu live de l'éditeur — substitue les valeurs
 * d'exemple déclarées dans le registre, aucune écriture. */
export async function previewEmailTemplate(
  key: string,
  input: unknown
): Promise<ActionResult<{ html: string }>> {
  await requireAdmin("emails");

  const definition = getTemplateDefinition(key);
  const parsed = emailTemplateFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }

  const exampleValues = Object.fromEntries(definition.variables.map((v) => [v.key, v.example]));
  const subject = substituteVariables(parsed.data.subject, exampleValues);
  const blocks = substituteBlocks(parsed.data.blocks, exampleValues);
  const html = await render(DynamicEmail({ preview: subject, blocks }));

  return { success: true, data: { html } };
}

/** Envoi réel à l'admin connecté, avec ses propres valeurs d'exemple —
 * même pattern que app/actions/broadcasts.ts::sendTestBroadcast. */
export async function sendTestEmailTemplate(key: string, input: unknown): Promise<ActionResult> {
  const viewerResult = await requireViewer();
  if (!viewerResult.success) return viewerResult;
  const { viewer } = viewerResult;
  await requireAdmin("emails");

  const definition = getTemplateDefinition(key);
  const parsed = emailTemplateFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Champs invalides" };
  }

  const exampleValues = Object.fromEntries(definition.variables.map((v) => [v.key, v.example]));
  const subject = substituteVariables(parsed.data.subject, exampleValues);
  const blocks = substituteBlocks(parsed.data.blocks, exampleValues);

  try {
    await sendTransactionalEmail({
      to: viewer.email,
      subject: `[TEST] ${subject}`,
      react: DynamicEmail({ preview: subject, blocks }),
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Échec de l'envoi." };
  }

  return { success: true, data: undefined };
}
