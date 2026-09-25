import type { EmailTemplateCategory } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { EmailBlock } from "@/lib/email-blocks";
import { EMAIL_TEMPLATES, getTemplateDefinition } from "@/lib/email-templates/registry";
import type { EmailTemplateDefinition } from "@/lib/email-templates/types";

export const EMAIL_TEMPLATE_CATEGORY_LABELS: Record<EmailTemplateCategory, string> = {
  ACCOUNT_APPLICATION: "Compte / candidature",
  COMPANY_BILLING: "Entreprise / paiement",
  TEAM_COLLABORATORS: "Équipe / collaborateurs",
  EVENT: "Évènement",
  DEAL_ROOM: "Deal Room",
  ROOM_MODERATION: "Salles / modération",
  SERVICES: "Services",
  MESSAGING: "Messagerie",
  ADMIN_ALERT: "Alertes internes admin",
};

export interface EmailTemplateListRow {
  key: string;
  category: EmailTemplateCategory;
  label: string;
  description: string;
  hasOverride: boolean;
  isActive: boolean;
}

/** Liste combinée registre + overrides pour /admin/emails — une ligne par
 * clé déclarée en code, quelle que soit la présence d'un override. */
export async function getEmailTemplatesForAdmin(): Promise<EmailTemplateListRow[]> {
  const overrides = await prisma.emailTemplateOverride.findMany({
    select: { key: true, isActive: true },
  });
  const overrideByKey = new Map(overrides.map((o) => [o.key, o]));

  return Object.values(EMAIL_TEMPLATES).map((def) => {
    const override = overrideByKey.get(def.key);
    return {
      key: def.key,
      category: def.category,
      label: def.label,
      description: def.description,
      hasOverride: Boolean(override),
      isActive: override?.isActive ?? true,
    };
  });
}

export interface EmailTemplateEditorData {
  definition: EmailTemplateDefinition;
  subject: string;
  blocks: EmailBlock[];
  hasOverride: boolean;
  isActive: boolean;
}

/** Contenu effectif (override si présent, sinon défaut du registre) pour
 * /admin/emails/[key] — c'est ce que l'admin voit et édite. */
export async function getEmailTemplateForEditor(
  key: string
): Promise<EmailTemplateEditorData | null> {
  const definition = EMAIL_TEMPLATES[key];
  if (!definition) return null;

  const override = await prisma.emailTemplateOverride.findUnique({ where: { key } });

  return {
    definition,
    subject: override?.subject ?? definition.defaultSubject,
    blocks: (override?.blocks as EmailBlock[] | null) ?? definition.defaultBlocks,
    hasOverride: Boolean(override),
    isActive: override?.isActive ?? true,
  };
}

export { getTemplateDefinition };
