import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import {
  EMAIL_TEMPLATE_CATEGORY_LABELS,
  getEmailTemplatesForAdmin,
  type EmailTemplateListRow,
} from "@/lib/email-templates/admin-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmailTemplateActiveToggle } from "@/components/admin/emails/email-template-active-toggle";

export const metadata: Metadata = { title: "Admin — Emails" };

/**
 * Bibliothèque d'emails transactionnels éditable (audit MVP, 25 septembre
 * 2026) — liste groupée par catégorie métier. `broadcast-email.tsx` n'y
 * figure pas : déjà éditable depuis /admin/communications, pas de doublon
 * d'UI.
 */
export default async function AdminEmailsPage() {
  try {
    await requireAdmin("emails");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const templates = await getEmailTemplatesForAdmin();
  const byCategory = new Map<string, EmailTemplateListRow[]>();
  for (const t of templates) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">Emails</h1>
          <p className="text-sm text-text-muted">
            {templates.length} email(s) transactionnel(s) —{" "}
            {templates.filter((t) => t.hasOverride).length} personnalisé(s)
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/communications">Communications (broadcasts) →</Link>
        </Button>
      </div>

      {Object.entries(EMAIL_TEMPLATE_CATEGORY_LABELS).map(([category, label]) => {
        const rows = byCategory.get(category);
        if (!rows || rows.length === 0) return null;

        return (
          <div key={category} className="overflow-hidden rounded-lg border border-border bg-white">
            <div className="border-b border-border bg-surface px-4 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {label}
              </h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">{row.label}</p>
                      <p className="text-xs text-text-muted">{row.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={row.hasOverride ? "executive" : "draft"}>
                        {row.hasOverride ? "Personnalisé" : "Modèle par défaut"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <EmailTemplateActiveToggle templateKey={row.key} isActive={row.isActive} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/emails/${row.key}`}>Éditer</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
