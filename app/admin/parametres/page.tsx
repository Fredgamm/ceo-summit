import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { isSmtpConfigured } from "@/lib/resend";
import { ReferentialManager } from "@/components/admin/settings/referential-manager";
import { AdminAccountsManager } from "@/components/admin/settings/admin-accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Admin — Paramètres" };

const TABS = [
  { key: "tarifs", label: "Tarifs & Règles" },
  { key: "referentiels", label: "Référentiels" },
  { key: "admins", label: "Administrateurs" },
  { key: "integrations", label: "Intégrations" },
];

/**
 * E8-T11 — Paramètres plateforme (wireframe bo-parametres.html).
 * Accès restreint à SUPER_ADMIN (voir lib/admin-rbac.ts — "parametres"
 * n'apparaît dans aucune autre liste de sections).
 */
export default async function AdminParametresPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  let userId: string;
  try {
    ({ userId } = await requireAdmin("parametres"));
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const activeTab = TABS.find((t) => t.key === searchParams.tab)?.key ?? "tarifs";

  let tabContent: React.ReactNode = null;

  if (activeTab === "tarifs") {
    tabContent = (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-white p-5">
          <h3 className="text-sm font-bold text-navy">Offres & tarifs d&apos;adhésion</h3>
          <p className="mb-4 mt-1 text-xs text-text-muted">
            Le prix et le nombre de places de chaque offre se gèrent depuis le catalogue des offres.
          </p>
          <Button asChild>
            <Link href="/admin/plans">Gérer les offres →</Link>
          </Button>
        </div>
      </div>
    );
  } else if (activeTab === "referentiels") {
    const items = await prisma.referential.findMany({ orderBy: { position: "asc" } });
    const byType = (type: string) =>
      items.filter((i) => i.type === type).map((i) => ({ id: i.id, label: i.label }));

    tabContent = (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ReferentialManager type="sector" title="Secteurs d'activité" items={byType("sector")} />
          <ReferentialManager
            type="opportunity_type"
            title="Types d'opportunité Deal Room"
            items={byType("opportunity_type")}
          />
        </div>
        <ReferentialManager
          type="country"
          title="Pays de l'Océan Indien"
          items={byType("country")}
        />
      </div>
    );
  } else if (activeTab === "admins") {
    const adminUsers = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });
    const users = await prisma.user.findMany({
      where: { id: { in: adminUsers.map((a) => a.userId) } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    const admins = adminUsers.map((admin) => ({
      ...admin,
      user: userById.get(admin.userId) ?? { name: "Compte introuvable", email: "" },
    }));

    tabContent = <AdminAccountsManager admins={admins} currentUserId={userId} />;
  } else if (activeTab === "integrations") {
    const paymentWebhookConfigured = Boolean(process.env.PAYMENT_WEBHOOK_SECRET);
    const smtpConfigured = isSmtpConfigured();
    const r2Configured = Boolean(
      process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
    );
    const zoomConfigured = Boolean(
      process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET
    );

    tabContent = (
      <div className="flex flex-col gap-4">
        <IntegrationCard
          title="Confirmation de paiement — webhook générique"
          configured={paymentWebhookConfigured}
          rows={[
            { label: "Webhook entrant", value: "app/api/webhooks/payments/route.ts" },
            { label: "Prestataire branché", value: "aucun pour l'instant" },
          ]}
        />
        <IntegrationCard
          title="Email transactionnel — SMTP (ceo-summit.mg)"
          configured={smtpConfigured}
          rows={[
            { label: "Serveur SMTP", value: process.env.SMTP_HOST ?? "non configuré" },
            { label: "Adresse expéditeur", value: process.env.EMAIL_FROM ?? "non configuré" },
          ]}
        />
        <IntegrationCard
          title="Stockage fichiers — Cloudflare R2"
          configured={r2Configured}
          rows={[{ label: "URL publique", value: process.env.R2_PUBLIC_URL ?? "non configuré" }]}
        />
        <IntegrationCard title="Zoom (webinaires)" configured={zoomConfigured} rows={[]} />
        <div className="rounded-lg border border-border bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy">Application mobile CEO Summit</h3>
            <Badge variant="draft">En développement</Badge>
          </div>
          <p className="text-sm text-text-mid">
            Aucune API mobile n&apos;existe encore dans ce projet — ce module reste à construire.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-navy">Paramètres</h1>

      <div className="flex gap-1 border-b-2 border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/parametres?tab=${tab.key}`}
            className={`-mb-0.5 border-b-2 px-4 py-2 text-sm font-semibold ${
              activeTab === tab.key ? "border-navy text-navy" : "border-transparent text-text-muted"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {tabContent}
    </div>
  );
}

function IntegrationCard({
  title,
  configured,
  rows,
}: {
  title: string;
  configured: boolean;
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-navy">{title}</h3>
        <Badge variant={configured ? "active" : "pending"}>
          {configured ? "● Connecté" : "Non configuré"}
        </Badge>
      </div>
      {rows.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="rounded-md bg-surface px-3 py-2 text-xs">
              <div className="mb-0.5 text-text-muted">{row.label}</div>
              <div className="font-bold text-navy">{row.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
