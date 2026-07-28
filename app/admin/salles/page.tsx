import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import { ROOM_ACCESS_LABEL } from "@/lib/rooms-query";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { RoomAdminActions } from "@/components/admin/room-admin-actions";
import { RoomReportDialog } from "@/components/admin/room-report-dialog";

export const metadata: Metadata = { title: "Admin — Salles" };

const ACCESS_BADGE = {
  ALL_MEMBERS: "member",
  EXECUTIVE_PLUS: "executive",
  CHAIRMAN_ONLY: "chairman",
} as const;

/** E4-T04 — modération salles : signalements en attente + liste/archivage. */
export default async function AdminRoomsPage() {
  try {
    await requireAdmin("salles");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const [rooms, pendingReports] = await Promise.all([
    prisma.room.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { messages: true } } },
    }),
    prisma.roomReport.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        roomMessage: { include: { room: { select: { name: true } } } },
        reportedBy: { select: { name: true } },
      },
    }),
  ]);

  const pendingByRoom = new Map<string, number>();
  for (const report of pendingReports) {
    const roomId = report.roomMessage.roomId;
    pendingByRoom.set(roomId, (pendingByRoom.get(roomId) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-navy">Salles thématiques</h1>
        <p className="text-sm text-text-muted">
          {rooms.length} salles · {pendingReports.length} signalement(s) en attente
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase text-text-muted">
          Signalements en attente
        </h2>
        {pendingReports.length === 0 ? (
          <EmptyState title="Aucun signalement en attente" />
        ) : (
          <div className="flex flex-col gap-2">
            {pendingReports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-white p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy">{report.roomMessage.room.name}</p>
                  <p className="truncate text-xs text-text-muted">
                    Signalé par {report.reportedBy.name}
                  </p>
                </div>
                <RoomReportDialog
                  reportId={report.id}
                  roomName={report.roomMessage.room.name}
                  reporterName={report.reportedBy.name}
                  messageContent={report.roomMessage.content}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase text-text-muted">Toutes les salles</h2>
        {rooms.length === 0 ? (
          <EmptyState title="Aucune salle" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface text-xs uppercase text-text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left">Salle</th>
                  <th className="px-4 py-2.5 text-left">Secteur</th>
                  <th className="px-4 py-2.5 text-left">Accès</th>
                  <th className="px-4 py-2.5 text-left">Messages</th>
                  <th className="px-4 py-2.5 text-left">Statut</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">{room.name}</p>
                      {(pendingByRoom.get(room.id) ?? 0) > 0 && (
                        <p className="text-xs text-red-600">
                          🚨 {pendingByRoom.get(room.id)} signalement(s)
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-mid">{room.sector}</td>
                    <td className="px-4 py-3">
                      <Badge variant={ACCESS_BADGE[room.minTier]}>
                        {ROOM_ACCESS_LABEL[room.minTier]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-navy">{room._count.messages}</td>
                    <td className="px-4 py-3">
                      <Badge variant={room.status === "ACTIVE" ? "active" : "draft"}>
                        {room.status === "ACTIVE" ? "Active" : "Archivée"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <RoomAdminActions roomId={room.id} status={room.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
