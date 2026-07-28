import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminShell } from "@/components/layout/admin-shell";

/**
 * E8-T01 — auth admin + layout BO. Middleware already blocks non-ADMIN
 * roles from /admin/*, so the checks here are defense in depth, not the
 * only gate. This is also where the AdminUser sub-role (super_admin /
 * moderateur / financier) is resolved for the granular per-section RBAC
 * (see lib/admin-rbac.ts) — AdminSidebar hides sections the sub-role can't
 * reach, and each /admin/* page re-checks canAccessSection() itself.
 *
 * The shell's title is fixed here since /admin/page.tsx (the dashboard) is
 * the only admin page today — once more are added, move title/breadcrumb
 * to a per-page concern instead of hardcoding it in the shared layout.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/dashboard");

  const [user, adminUser, pendingCandidatures, pendingOpportunities] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id } }),
    prisma.adminUser.findUnique({ where: { userId: session.user.id } }),
    prisma.membershipApplication.count({ where: { status: "PENDING" } }),
    prisma.opportunity.count({ where: { status: "PENDING_MODERATION" } }),
  ]);
  if (!user) redirect("/login");

  return (
    <AdminShell
      admin={{ name: user.name, email: user.email, role: adminUser?.role ?? "MODERATEUR" }}
      badges={{ candidatures: pendingCandidatures, opportunities: pendingOpportunities }}
      title="Tableau de bord"
    >
      {children}
    </AdminShell>
  );
}
