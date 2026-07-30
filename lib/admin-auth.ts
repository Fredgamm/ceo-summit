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
  const role = adminUser?.role ?? "MODERATEUR";
  if (!canAccessSection(role, section)) {
    throw new AdminAccessError("Accès refusé pour cette section.");
  }

  return { userId: session.user.id };
}
