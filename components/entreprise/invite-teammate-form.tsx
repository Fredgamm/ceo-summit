"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { inviteTeammate, resendInvite, revokeInvite } from "@/app/actions/company-invites";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface PendingInvite {
  id: string;
  name: string;
  email: string;
}

export function InviteTeammateForm({
  companyId,
  pendingInvites,
}: {
  companyId: string;
  pendingInvites: PendingInvite[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [resendingId, setResendingId] = React.useState<string | null>(null);
  const [resentId, setResentId] = React.useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await inviteTeammate(companyId, { name, email });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setName("");
      setEmail("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    const result = await revokeInvite(inviteId);
    if (result.success) router.refresh();
  }

  async function handleResend(inviteId: string) {
    setError(null);
    setResentId(null);
    setResendingId(inviteId);
    try {
      const result = await resendInvite(inviteId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setResentId(inviteId);
      router.refresh();
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="invite-name">Nom</Label>
          <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? "Envoi…" : "Inviter"}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {pendingInvites.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase text-text-muted">Invitations en attente</p>
          {pendingInvites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
            >
              <div>
                <span className="font-semibold text-navy">{invite.name}</span>{" "}
                <span className="text-text-muted">{invite.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="pending">En attente</Badge>
                {resentId === invite.id && (
                  <span className="text-xs text-emerald-700">✓ Renvoyée</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={resendingId === invite.id}
                  onClick={() => handleResend(invite.id)}
                >
                  {resendingId === invite.id ? "…" : "Renvoyer"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleRevoke(invite.id)}>
                  Révoquer
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
