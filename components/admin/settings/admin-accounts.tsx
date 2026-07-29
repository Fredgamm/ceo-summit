"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AdminRole } from "@prisma/client";

import { promoteToAdmin, updateAdminRole, toggleAdminActive } from "@/app/actions/admin-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateFr, initials } from "@/lib/utils";

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super Admin",
  MODERATEUR: "Modérateur",
  FINANCIER: "Financier",
};

export interface AdminAccountRow {
  id: string;
  userId: string;
  role: AdminRole;
  active: boolean;
  lastLoginAt: Date | null;
  user: { name: string; email: string };
}

interface AdminAccountsManagerProps {
  admins: AdminAccountRow[];
  currentUserId: string;
}

/**
 * E8-T11 — "Administrateurs". Contrairement au wireframe (qui crée un compte
 * ex-nihilo), on promeut un membre existant : c'est le seul flux de création
 * de compte cohérent avec le reste de la plateforme (webhook Evolia ou
 * approbation de candidature) — voir promoteToAdmin dans admin-settings.ts.
 */
export function AdminAccountsManager({ admins, currentUserId }: AdminAccountsManagerProps) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<AdminRole>("MODERATEUR");
  const [promoting, setPromoting] = React.useState(false);
  const [toggleTarget, setToggleTarget] = React.useState<AdminAccountRow | null>(null);

  async function handlePromote() {
    if (!email.trim()) return;
    setPromoting(true);
    try {
      const result = await promoteToAdmin(email, role);
      if (result.success) {
        toast.success("Compte administrateur créé.");
        setEmail("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setPromoting(false);
    }
  }

  async function handleRoleChange(adminId: string, newRole: AdminRole) {
    const result = await updateAdminRole(adminId, newRole);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    const result = await toggleAdminActive(toggleTarget.id);
    if (result.success) {
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-navy">Promouvoir un membre en administrateur</h3>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="email"
            placeholder="email@membre.mg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="max-w-xs"
          />
          <Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABEL) as AdminRole[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handlePromote} disabled={promoting || !email.trim()}>
            {promoting ? "Création…" : "+ Promouvoir"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Le membre doit déjà avoir un compte actif (via candidature approuvée).
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs uppercase text-text-muted">
            <tr>
              <th className="px-4 py-2.5 text-left">Nom</th>
              <th className="px-4 py-2.5 text-left">Email</th>
              <th className="px-4 py-2.5 text-left">Rôle</th>
              <th className="px-4 py-2.5 text-left">Dernière connexion</th>
              <th className="px-4 py-2.5 text-left">Statut</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {admins.map((admin) => {
              const isSelf = admin.userId === currentUserId;
              return (
                <tr key={admin.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-light text-xs font-bold text-navy">
                        {initials(admin.user.name)}
                      </div>
                      <span className="font-semibold text-navy">{admin.user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{admin.user.email}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={admin.role}
                      onValueChange={(v) => handleRoleChange(admin.id, v as AdminRole)}
                    >
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROLE_LABEL) as AdminRole[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {admin.lastLoginAt ? formatDateFr(admin.lastLoginAt) : "Jamais connecté"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={admin.active ? "active" : "suspended"}>
                      {admin.active ? "Actif" : "Désactivé"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-xs italic text-text-muted">Votre compte</span>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setToggleTarget(admin)}>
                        {admin.active ? "Désactiver" : "Réactiver"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={toggleTarget !== null}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={toggleTarget?.active ? "Désactiver ce compte" : "Réactiver ce compte"}
        description={
          toggleTarget?.active ? (
            <>
              Désactiver le compte de <strong>{toggleTarget?.user.name}</strong> ? Il ne pourra plus
              se connecter au backoffice.
            </>
          ) : (
            <>
              Réactiver le compte de <strong>{toggleTarget?.user.name}</strong> ?
            </>
          )
        }
        confirmLabel={toggleTarget?.active ? "Désactiver" : "Réactiver"}
        variant={toggleTarget?.active ? "destructive" : "default"}
        onConfirm={handleToggleActive}
      />

      <div className="rounded-lg border border-border bg-white p-5">
        <h3 className="mb-3 text-sm font-bold text-navy">Rôles et permissions</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="bg-navy-dark px-3.5 py-2.5 text-sm font-bold text-gold">
              ⭐ Super Admin
            </div>
            <ul className="flex flex-col gap-1.5 p-3.5 text-xs text-text-mid">
              <li>✓ Accès à tous les modules</li>
              <li>✓ Gestion des admins</li>
              <li>✓ Modification des tarifs</li>
              <li>✓ Export comptable</li>
              <li>✓ Paramètres intégrations</li>
            </ul>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="bg-navy px-3.5 py-2.5 text-sm font-bold text-white">🛡 Modérateur</div>
            <ul className="flex flex-col gap-1.5 p-3.5 text-xs text-text-mid">
              <li>✓ Candidatures & membres</li>
              <li>✓ Modération Deal Room</li>
              <li>✓ Gestion salles</li>
              <li>✓ Communications</li>
              <li className="text-text-muted">✕ Finances & Paramètres</li>
            </ul>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="bg-surface px-3.5 py-2.5 text-sm font-bold text-navy">💰 Financier</div>
            <ul className="flex flex-col gap-1.5 p-3.5 text-xs text-text-mid">
              <li>✓ Tableau de bord (lecture)</li>
              <li>✓ Finances & paiements</li>
              <li>✓ Export comptable</li>
              <li className="text-text-muted">✕ Membres & modération</li>
              <li className="text-text-muted">✕ Paramètres</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
