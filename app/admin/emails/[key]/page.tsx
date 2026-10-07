import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import {
  EMAIL_TEMPLATE_CATEGORY_LABELS,
  getEmailTemplateForEditor,
} from "@/lib/email-templates/admin-query";
import { EmailTemplateEditor } from "@/components/admin/emails/email-template-editor";

export const metadata: Metadata = { title: "Admin — Éditer un email" };

export default async function EditEmailTemplatePage({ params }: { params: { key: string } }) {
  try {
    await requireAdmin("emails");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const data = await getEmailTemplateForEditor(params.key);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {EMAIL_TEMPLATE_CATEGORY_LABELS[data.definition.category]}
        </p>
        <h1 className="text-xl font-bold text-navy">{data.definition.label}</h1>
        <p className="text-sm text-text-muted">
          {data.definition.description} — {data.definition.triggerHint}
        </p>
      </div>
      <EmailTemplateEditor
        templateKey={data.definition.key}
        variables={data.definition.variables}
        initialSubject={data.subject}
        initialBlocks={data.blocks}
        hasOverride={data.hasOverride}
        isActive={data.isActive}
      />
    </div>
  );
}
