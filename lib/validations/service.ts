import { z } from "zod";

/** E5-T03 — "Formulaire multi-étapes (titre, catégorie, description, visuels)". */
export const serviceFormSchema = z.object({
  category: z.string().trim().min(1, "La catégorie est requise"),
  title: z.string().trim().min(10, "Le titre doit contenir au moins 10 caractères").max(140),
  description: z.string().trim().min(20, "La description doit contenir au moins 20 caractères"),
  priceInfo: z.string().trim().max(140).optional().default(""),
  gallery: z.array(z.string()).max(6, "6 visuels maximum").default([]),
});

export const SERVICE_GALLERY_MAX_IMAGES = 6;
export const SERVICE_GALLERY_MAX_BYTES = 5 * 1024 * 1024;
export const SERVICE_GALLERY_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const SERVICE_GALLERY_WIDTH = 1200;
export const SERVICE_GALLERY_HEIGHT = 800;
