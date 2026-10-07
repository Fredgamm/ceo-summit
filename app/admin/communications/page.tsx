import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { SEGMENT_LABEL } from "@/lib/broadcast-segments";
import { getReferentialLabels } from "@/lib/referentials-query";
import { BroadcastComposer } from "@/components/admin/communications/broadcast-composer";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateFr } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Communications" };

const TABS = [
  { key: "broadcast", label: "Nouveau broadcast" },
  { key: "historique", label: "Historique" },
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

  const [sectors, countries, plans] =
    activeTab === "broadcast"
      ? await Promise.all([
          getReferentialLabels("sector"),
          getReferentialLabels("country"),
          prisma.plan.findMany({
            orderBy: { displayOrder: "asc" },
            select: { id: true, name: true },
          }),
        ])
      : [[], [], []];

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

      {activeTab === "broadcast" && (
        <BroadcastComposer sectors={sectors} countries={countries} plans={plans} />
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
                  <th className="px-4 py-2.5 text-left">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((b) => {
                  return (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-semibold text-navy">{b.subject}</td>
                      <td className="px-4 py-3 text-text-muted">{SEGMENT_LABEL[b.segment]}</td>
                      <td className="px-4 py-3 font-semibold">{b.recipientCount}</td>
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
