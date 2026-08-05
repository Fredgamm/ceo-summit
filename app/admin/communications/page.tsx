import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { SEGMENT_LABEL } from "@/lib/broadcast-segments";
import { getReferentialLabels } from "@/lib/referentials-query";
import { BroadcastComposer } from "@/components/admin/communications/broadcast-composer";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateFr } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Communications" };

const TABS = [
  { key: "broadcast", label: "Nouveau broadcast" },
  { key: "templates", label: "Templates automatiques" },
  { key: "historique", label: "Historique" },
];

/**
 * E8-T09 — les 6 flux "automatiques" évoqués par le wireframe ne sont pas
 * tous réellement automatisés dans ce projet (pas d'infra de cron pour les
 * rappels/relances) — ce statut reflète l'état réel du code, pas le
 * wireframe. "Éditer" n'existe pas : ces templates sont des composants
 * React Email versionnés dans emails/*.tsx, pas du contenu en base.
 */
const AUTOMATED_TEMPLATES = [
  {
    name: "Email de bienvenue (activation)",
    trigger: "Envoyé après confirmation de paiement Evolia",
    file: "emails/activation-email.tsx",
    active: true,
  },
  {
    name: "Email de refus candidature",
    trigger: "Envoyé après refus d'une demande d'accès",
    file: "emails/application-refused-email.tsx",
    active: true,
  },
  {
    name: "Confirmation inscription événement",
    trigger: "Envoyé après inscription et paiement confirmé",
    file: "emails/event-registration-email.tsx",
    active: true,
  },
  {
    name: "Rappel événement J-7 / J-1",
    trigger: "Prévu 7 et 1 jours avant chaque événement",
    file: null,
    active: false,
  },
  {
    name: "Reçu achat crédits",
    trigger: "Envoyé après validation admin d'un achat de crédits",
    file: "emails/credit-purchase-confirmed-email.tsx",
    active: true,
  },
  {
    name: "Renouvellement abonnement",
    trigger: "Relance prévue 30 jours avant expiration",
    file: null,
    active: false,
  },
];

export default async function AdminCommunicationsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  try {
    await requireAdmin("communications");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const activeTab = TABS.find((t) => t.key === searchParams.tab)?.key ?? "broadcast";

  const history =
    activeTab === "historique"
      ? await prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
      : [];

  const [sectors, countries] =
    activeTab === "broadcast"
      ? await Promise.all([getReferentialLabels("sector"), getReferentialLabels("country")])
      : [[], []];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-navy">Communications</h1>

      <div className="flex gap-1 border-b-2 border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/communications?tab=${tab.key}`}
            className={`-mb-0.5 border-b-2 px-4 py-2 text-sm font-semibold ${
              activeTab === tab.key ? "border-navy text-navy" : "border-transparent text-text-muted"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {activeTab === "broadcast" && <BroadcastComposer sectors={sectors} countries={countries} />}

      {activeTab === "templates" && (
        <div className="flex flex-col gap-2.5">
          {AUTOMATED_TEMPLATES.map((t) => (
            <div
              key={t.name}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-white p-4"
            >
              <div>
                <p className="text-sm font-bold text-navy">{t.name}</p>
                <p className="text-xs text-text-muted">{t.trigger}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={t.active ? "active" : "draft"}>
                  {t.active ? "Actif" : "Non automatisé"}
                </Badge>
                {t.file && <span className="text-xs text-text-muted">{t.file}</span>}
              </div>
            </div>
          ))}
          <p className="mt-1 text-xs text-text-muted">
            Ces templates sont des composants React Email versionnés dans le code (`emails/*.tsx`),
            pas du contenu éditable en base — les modifier passe par un déploiement, pas par cette
            page.
          </p>
        </div>
      )}

      {activeTab === "historique" &&
        (history.length === 0 ? (
          <EmptyState title="Aucun broadcast envoyé" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left">Objet</th>
                  <th className="px-4 py-2.5 text-left">Envoyé à</th>
                  <th className="px-4 py-2.5 text-left">Destinataires</th>
                  <th className="px-4 py-2.5 text-left">Taux d&apos;ouverture</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((b) => {
                  const openRate =
                    b.recipientCount > 0 ? Math.round((b.openCount / b.recipientCount) * 100) : 0;
                  return (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-semibold text-navy">{b.subject}</td>
                      <td className="px-4 py-3 text-text-muted">{SEGMENT_LABEL[b.segment]}</td>
                      <td className="px-4 py-3 font-semibold">{b.recipientCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${openRate}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold">{openRate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-muted">{formatDateFr(b.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
