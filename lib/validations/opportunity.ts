import { z } from "zod";

/** E6-T03 — publication d'opportunité Deal Room, en 4 étapes côté formulaire. */
export const opportunityFormSchema = z.object({
  type: z.enum(["PARTENARIAT", "INVESTISSEMENT", "APPEL_OFFRES", "LEVEE_FONDS", "JOINT_VENTURE"]),
  sector: z.string().trim().min(1, "Le secteur est requis"),
  country: z.string().trim().min(1, "La zone géographique est requise"),
  title: z.string().trim().min(10, "Le titre doit contenir au moins 10 caractères").max(140),
  description: z.string().trim().min(20, "La description doit contenir au moins 20 caractères"),
  budget: z.string().optional().default(""), // Ariary, parsed manually — optional per backlog
  deadline: z.string().optional().default(""), // "YYYY-MM-DD", optional
  visibility: z.enum(["MEMBER", "EXECUTIVE", "CHAIRMAN"]),
  attachments: z.array(z.string()).default([]),
});

export type OpportunityFormInput = z.input<typeof opportunityFormSchema>;

// Backlog: "documents joints (R2, PDF 10Mo max)".
export const OPPORTUNITY_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const OPPORTUNITY_ATTACHMENT_ALLOWED_MIME_TYPES = ["application/pdf"];
export const OPPORTUNITY_ATTACHMENT_MAX_COUNT = 3;
