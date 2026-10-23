import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAccessError } from "@/lib/admin-auth";
import {
  buildAdminMembersQuery,
  ADMIN_MEMBERS_PAGE_SIZE,
  type AdminMembersSearchParams,
} from "@/lib/admin-members-query";
import { getReferentialLabels } from "@/lib/referentials-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberFilters } from "@/components/admin/member-filters";
import { formatDateFr, initials } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin — Membres" };

const STATUS_BADGE: Record<string, "active" | "suspended" | "pending" | "refused" | "draft"> = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
  PENDING_ACTIVATION: "pending",
  CANCELLED: "refused",
  EXPIRED: "draft",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Actif",
  SUSPENDED: "Suspendu",
  PENDING_ACTIVATION: "En attente",
  CANCELLED: "Exclu",
  EXPIRED: "Expiré",
};

/** E8-T04 — liste membres (wireframe bo-membres.html, réduite aux filtres/pagination du backlog). */
export default async function AdminMembresPage(props: {
  searchParams: Promise<AdminMembersSearchParams>;
}) {
  const searchParams = await props.searchParams;
  try {
    await requireAdmin("membres");
  } catch (err) {
    if (err instanceof AdminAccessError) redirect("/admin");
    throw err;
  }

  const [validSectors, validCountries] = await Promise.all([
    getReferentialLabels("sector"),
    getReferentialLabels("country"),
  ]);
  const { where, skip, take, page } = buildAdminMembersQuery(searchParams, {
    validSectors,
    validCountries,
  });

  const [members, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { company: { select: { name: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_MEMBERS_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <MemberFilters sectors={validSectors} countries={validCountries} />
        <span className="text-sm text-text-muted">{total} membres</span>
      </div>

      {members.length === 0 ? (
        <EmptyState title="Aucun membre trouvé" description="Essayez d'autres filtres." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2.5 text-left">Membre</th>
                <th className="px-4 py-2.5 text-left">Entreprise</th>
                <th className="px-4 py-2.5 text-left">Pays</th>
                <th className="px-4 py-2.5 text-left">Membre depuis</th>
                <th className="px-4 py-2.5 text-left">Statut</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                        <AvatarFallback>{initials(member.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="flex items-center gap-1.5 font-semibold text-navy">
                          {member.name}
                          {member.isPlatformAdmin && <Badge variant="draft">Staff</Badge>}
                        </p>
                        <p className="text-xs text-text-muted">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-mid">{member.company?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-text-mid">{member.country ?? "—"}</td>
                  <td className="px-4 py-3 text-text-muted">{formatDateFr(member.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_BADGE[member.status]}>
                      {STATUS_LABEL[member.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/membres/${member.id}`}
                      className="text-xs font-semibold text-navy-mid"
                    >
                      Voir →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildPageLink(searchParams, page - 1)}>Précédent</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Précédent
            </Button>
          )}
          <span className="text-sm text-text-muted">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildPageLink(searchParams, page + 1)}>Suivant</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Suivant
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function buildPageLink(searchParams: AdminMembersSearchParams, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `/admin/membres?${params.toString()}`;
}
