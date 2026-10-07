import type { ReactElement } from "react";

import { prisma } from "@/lib/prisma";
import { getTemplateDefinition } from "@/lib/email-templates/registry";
import {
  substituteBlocks,
  substituteVariables,
  type EmailBlock,
  type TemplateVariables,
} from "@/lib/email-blocks";
import { DynamicEmail } from "@/emails/dynamic-email";

export type ResolvedEmail = { subject: string; react: ReactElement };

/**
 * Bibliothèque d'emails transactionnels éditable (audit MVP, 25 septembre
 * 2026) — point d'entrée unique pour tous les sites d'appel qui envoyaient
 * jusqu'ici un composant `emails/*.tsx` codé en dur. Retombe sur le modèle
 * par défaut du registre (lib/email-templates/registry.ts) tant qu'aucun
 * `EmailTemplateOverride` n'existe pour cette clé — un email non
 * personnalisé reste donc pixel-identique à avant cette fonctionnalité.
 *
 * Retourne `null` quand un admin a désactivé ce template : l'appelant DOIT
 * alors ne rien envoyer (voir les sites migrés, ex. lib/payment-confirmations.ts).
 */
export async function resolveEmail(
  key: string,
  variables: TemplateVariables
): Promise<ResolvedEmail | null> {
  const definition = getTemplateDefinition(key); // lève sur une clé fautive côté programmeur
  const override = await prisma.emailTemplateOverride.findUnique({ where: { key } });

  if (override && !override.isActive) return null;

  const subjectTemplate = override?.subject ?? definition.defaultSubject;
  const blocksTemplate = (override?.blocks as EmailBlock[] | null) ?? definition.defaultBlocks;

  const subject = substituteVariables(subjectTemplate, variables);
  const blocks = substituteBlocks(blocksTemplate, variables);

  return { subject, react: DynamicEmail({ preview: subject, blocks }) };
}
