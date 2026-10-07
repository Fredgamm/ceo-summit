import type { EmailTemplateCategory } from "@prisma/client";
import type { EmailTemplateDefinition } from "./types";
import { ACCOUNT_APPLICATION_TEMPLATES } from "./account-application";
import { COMPANY_BILLING_TEMPLATES } from "./company-billing";
import { TEAM_COLLABORATORS_TEMPLATES } from "./team-collaborators";
import { EVENT_TEMPLATES } from "./event";
import { DEAL_ROOM_TEMPLATES } from "./deal-room";
import { ROOM_MODERATION_TEMPLATES } from "./room-moderation";
import { SERVICES_TEMPLATES } from "./services";
import { MESSAGING_TEMPLATES } from "./messaging";
import { ADMIN_ALERT_TEMPLATES } from "./admin-alert";

const ALL_TEMPLATES: EmailTemplateDefinition[] = [
  ...ACCOUNT_APPLICATION_TEMPLATES,
  ...COMPANY_BILLING_TEMPLATES,
  ...TEAM_COLLABORATORS_TEMPLATES,
  ...EVENT_TEMPLATES,
  ...DEAL_ROOM_TEMPLATES,
  ...ROOM_MODERATION_TEMPLATES,
  ...SERVICES_TEMPLATES,
  ...MESSAGING_TEMPLATES,
  ...ADMIN_ALERT_TEMPLATES,
];

export const EMAIL_TEMPLATES: Record<string, EmailTemplateDefinition> = Object.fromEntries(
  ALL_TEMPLATES.map((t) => [t.key, t])
);

export class UnknownEmailTemplateError extends Error {
  constructor(key: string) {
    super(`Clé de template email inconnue : "${key}"`);
    this.name = "UnknownEmailTemplateError";
  }
}

/** Lève si la clé n'existe pas dans le registre — une erreur de programmeur
 * (site d'appel avec une clé fautive), jamais une entrée utilisateur. */
export function getTemplateDefinition(key: string): EmailTemplateDefinition {
  const def = EMAIL_TEMPLATES[key];
  if (!def) throw new UnknownEmailTemplateError(key);
  return def;
}

export function listTemplatesByCategory(): Record<
  EmailTemplateCategory,
  EmailTemplateDefinition[]
> {
  const grouped = {} as Record<EmailTemplateCategory, EmailTemplateDefinition[]>;
  for (const def of ALL_TEMPLATES) {
    (grouped[def.category] ??= []).push(def);
  }
  return grouped;
}
