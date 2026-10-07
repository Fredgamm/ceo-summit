"use client";

import * as React from "react";
import type { ServiceStatus } from "@prisma/client";

import { deleteServiceListing } from "@/app/actions/services";
import { ServiceFormWizard } from "@/components/catalogue-services/service-form-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Briefcase } from "lucide-react";
import { formatDateFr } from "@/lib/utils";
import { AddButton } from "@/components/ui/add-button";

const STATUS_BADGE: Record<ServiceStatus, "draft" | "pending" | "active" | "refused"> = {
  DRAFT: "draft",
  PENDING_MODERATION: "pending",
  PUBLISHED: "active",
  REFUSED: "refused",
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  DRAFT: "Brouillon",
  PENDING_MODERATION: "En attente de validation",
  PUBLISHED: "Publié",
  REFUSED: "Refusé",
};

export interface CompanyServiceListing {
  id: string;
  title: string;
  category: string;
  description: string;
  priceInfo: string | null;
  gallery: string[];
  status: ServiceStatus;
  createdAt: string | Date;
}

/**
 * Rapport QA du 1er oct. 2026 (§2.5) — gestion des services d'une entreprise
 * depuis l'onglet "Services" de sa fiche : le gérant ajoute/modifie/supprime,
 * les autres visiteurs ne voient (en lecture seule, hors de ce composant,
 * côté page serveur) que les fiches `PUBLISHED`.
 */
export function CompanyServicesManager({
  services,
  isCompanyAdmin,
}: {
  services: CompanyServiceListing[];
  isCompanyAdmin: boolean;
}) {
  const [view, setView] = React.useState<"list" | "create" | string>("list");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette fiche service ? Cette action est irréversible.")) return;
    setError(null);
    setDeletingId(id);
    try {
      const result = await deleteServiceListing(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      window.location.reload();
    } finally {
      setDeletingId(null);
    }
  }

  if (view === "create") {
    return <ServiceFormWizard mode="create" onDone={() => window.location.reload()} />;
  }

  const editing = services.find((s) => s.id === view);
  if (editing) {
    return (
      <ServiceFormWizard
        mode="edit"
        serviceId={editing.id}
        initialValues={{
          category: editing.category,
          title: editing.title,
          description: editing.description,
          priceInfo: editing.priceInfo ?? "",
          gallery: editing.gallery,
        }}
        onDone={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isCompanyAdmin && (
        <div className="flex justify-end">
          <AddButton onClick={() => setView("create")}>Ajouter un service</AddButton>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {services.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Aucun service renseigné"
          description="Les services proposés par cette entreprise s'afficheront ici."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-white p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <Badge variant="secondary" className="w-fit">
                  {s.category}
                </Badge>
                {isCompanyAdmin && (
                  <Badge variant={STATUS_BADGE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                )}
              </div>
              <p className="text-sm font-bold text-navy">{s.title}</p>
              <p className="line-clamp-2 text-xs text-text-mid">{s.description}</p>
              <div className="flex flex-wrap gap-2 text-xs text-text-muted">
                <span>Déposé le {formatDateFr(s.createdAt)}</span>
                {s.priceInfo && <span>· {s.priceInfo}</span>}
              </div>
              {isCompanyAdmin && (
                <div className="mt-1 flex gap-2 border-t border-border pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setView(s.id)}>
                    Modifier
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingId === s.id}
                    onClick={() => handleDelete(s.id)}
                  >
                    {deletingId === s.id ? "…" : "Supprimer"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
