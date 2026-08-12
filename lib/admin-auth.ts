import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSection, type AdminSection } from "@/lib/admin-rbac";

export class AdminAccessError extends Error {}

/**
 * Server-action-side re-check of admin access — middleware.ts and
 * app/admin/layout.tsx already gate page navigation, but Server Actions are
 * their own entry points and must not rely solely on the page that happened
 * to render the button that called them.
 */
export async function requireAdmin(section: AdminSection): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isPlatformAdmin) {
    throw new AdminAccessError("Non autorisé.");
  }

  const adminUser = await prisma.adminUser.findUnique({ where: { userId: session.user.id } });
  /**
   * Correctif (7 août 2026, audit) — `toggleAdminActive` (admin-settings.ts)
   * ne fait que basculer ce champ ; rien ne le relisait jamais nulle part,
   * un admin "désactivé" gardait donc un accès complet via son
   * `isPlatformAdmin` de session, inchangé. Cette fonction relit déjà
   * `AdminUser` en base à chaque appel (pas seulement au login, contrairement
   * au reste de la session JWT) — le bon endroit pour faire respecter la
   * désactivation en temps réel.
   */
  if (adminUser?.active === false) {
    throw new AdminAccessError("Ce compte administrateur a été désactivé.");
  }
  const role = adminUser?.role ?? "MODERATEUR";
  if (!canAccessSection(role, section)) {
    throw new AdminAccessError("Accès refusé pour cette section.");
  }

  return { userId: session.user.id };
}
