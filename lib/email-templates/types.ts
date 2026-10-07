import type { EmailTemplateCategory } from "@prisma/client";
import type { EmailBlock } from "@/lib/email-blocks";

/** Une variable disponible pour un template donné — pilote le panneau
 * "Variables disponibles" de l'éditeur admin et les valeurs d'exemple
 * utilisées pour l'aperçu live et l'envoi de test. */
export interface EmailVariableDef {
  key: string; // "companyName" — doit correspondre à {{companyName}} utilisé dans les blocs
  label: string; // "Nom de l'entreprise" — affiché dans l'admin
  example: string; // "Rakoto Holding" — aperçu + envoi de test
}

/**
 * Définition en code d'un template email — le "modèle par défaut" que sert
 * `resolveEmail()` tant qu'aucun admin ne l'a personnalisé. Une entrée par
 * clé, réparties dans lib/email-templates/<categorie>.ts (une catégorie par
 * fichier, agrégées dans registry.ts).
 */
export interface EmailTemplateDefinition {
  key: string; // kebab-case, unique, ex. "company-payment-confirmed"
  category: EmailTemplateCategory;
  label: string; // "Paiement entreprise confirmé" — liste admin
  description: string; // à qui / quand cet email part
  triggerHint: string; // "lib/payment-confirmations.ts::confirmCompanyPaymentCore"
  variables: EmailVariableDef[];
  defaultSubject: string; // peut contenir {{variables}}
  defaultBlocks: EmailBlock[];
}
