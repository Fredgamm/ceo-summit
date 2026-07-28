import type { AdminRole } from "@prisma/client";

import { AdminSidebar } from "@/components/layout/admin-sidebar";

interface AdminShellProps {
  admin: { name: string; email: string; role: AdminRole };
  badges?: { candidatures?: number; opportunities?: number };
  breadcrumb?: string;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Backoffice layout: 240px dark sidebar + sticky topbar + main content.
 * 1:1 with the /wireframe-bo/*.html structure (.bo-layout / .bo-sidebar / .bo-topbar / .bo-body).
 * Admin is desktop-first — no bottom nav / mobile collapse for v1 (internal tool).
 */
export function AdminShell({
  admin,
  badges,
  breadcrumb = "Admin /",
  title,
  actions,
  children,
}: AdminShellProps) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar admin={admin} badges={badges} />

      <div className="ml-sidebar-bo flex min-h-screen flex-1 flex-col">
        <div className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-white px-7">
          <span className="text-sm text-text-muted">{breadcrumb}</span>
          <span className="text-sm font-semibold text-navy">{title}</span>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>

        <div className="flex-1 p-7">{children}</div>
      </div>
    </div>
  );
}
