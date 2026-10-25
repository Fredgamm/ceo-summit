"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AdminRole } from "@prisma/client";

import {
  createAdminAccount,
  resendAdminInvite,
  updateAdminRole,
  toggleAdminActive,
} from "@/app/actions/admin-settings";
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
  /** Faux tant que la personne n'a pas choisi son mot de passe (lien d'invitation). */
  hasPassword: boolean;
}

interface AdminAccountsManagerProps {
  admins: AdminAccountRow[];
  currentUserId: string;
}

/**
 * E8-T11 — "Administrateurs". 25 oct. 2026 : le super admin crée lui-même
 * le compte (nom, e-mail, rôle) ; la personne reçoit un lien pour choisir
 * son mot de passe. Un e-mail déjà inscrit est simplement promu — voir
 * createAdminAccount dans admin-settings.ts.
 */
export function AdminAccountsManager({ admins, currentUserId }: AdminAccountsManagerProps) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<AdminRole>("MODERATEUR");
  const [creating, setCreating] = React.useState(false);
  const [resendingId, setResendingId] = React.useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = React.useState<AdminAccountRow | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || creating) return;
    setCreating(true);
    try {
      const result = await createAdminAccount({ name, email, role });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const { created, emailSent } = result.data;
      const what = created ? "Administrateur créé." : "Compte existant promu administrateur.";
      if (emailSent === false) {
        toast.warning(
          `${what} L'e-mail n'a pas pu partir : utilisez « Renvoyer le lien » dans la liste.`
        );
      } else if (emailSent) {
        toast.success(`${what} Un lien pour choisir son mot de passe lui a été envoyé.`);
      } else {
        toast.success(`${what} Il se connecte avec son mot de passe habituel.`);
      }
      setName("");
      setEmail("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleResend(admin: AdminAccountRow) {
    setResendingId(admin.id);
    try {
      const result = await resendAdminInvite(admin.id);
      if (result.success) toast.success(`Lien renvoyé à ${admin.user.email}.`);
      else toast.error(result.error);
    } finally {
      setResendingId(null);
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
        <h3 className="mb-3 text-sm font-bold text-navy">Ajouter un administrateur</h3>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
          <Input
            placeholder="Nom complet"
            aria-label="Nom complet"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="w-full sm:max-w-[220px]"
          />
          <Input
            type="email"
            placeholder="email@ceo-summit.mg"
            aria-label="Adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full sm:max-w-xs"
          />
          <Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Rôle">
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
          <Button type="submit" disabled={creating || !email.trim()}>
            {creating ? "Création…" : "+ Ajouter"}
          </Button>
        </form>
        <p className="mt-2 text-xs text-text-muted">
          La personne reçoit un e-mail pour choisir son mot de passe (lien valable 72 heures). Si
          l&apos;e-mail a déjà un compte sur la plateforme, ce compte devient administrateur.
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
                    {!admin.hasPassword && admin.active ? (
                      <Badge variant="pending">Mot de passe à choisir</Badge>
                    ) : (
                      <Badge variant={admin.active ? "active" : "suspended"}>
                        {admin.active ? "Actif" : "Désactivé"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-xs italic text-text-muted">Votre compte</span>
                    ) : (
                      <div className="flex justify-end gap-1">
                        {!admin.hasPassword && admin.active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResend(admin)}
                            disabled={resendingId === admin.id}
                          >
                            {resendingId === admin.id ? "Envoi…" : "Renvoyer le lien"}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setToggleTarget(admin)}>
                          {admin.active ? "Désactiver" : "Réactiver"}
                        </Button>
                      </div>
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
