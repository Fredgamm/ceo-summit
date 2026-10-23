"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { sendPaymentsOpenEmail, updatePaymentsOpenDay } from "@/app/actions/admin-preregistration";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateFr, pluralize } from "@/lib/utils";

/**
 * 23 oct. 2026 — préinscription : jour d'ouverture des paiements, nombre de
 * préinscrits, e-mail d'ouverture. Voir lib/preregistration.ts.
 */
export function PreregistrationSettings({
  paymentsOpenOn,
  active,
  openEmailSentAt,
  preregisteredCount,
}: {
  paymentsOpenOn: string | null;
  active: boolean;
  openEmailSentAt: string | null;
  preregisteredCount: number;
}) {
  const router = useRouter();
  const [day, setDay] = React.useState(paymentsOpenOn ?? "");
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  async function save(value: string) {
    setSaving(true);
    try {
      const result = await updatePaymentsOpenDay(value);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        value ? "Date d'ouverture des paiements enregistrée." : "Préinscription désactivée."
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    const result = await sendPaymentsOpenEmail();
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const { sent, failed } = result.data;
    if (failed > 0) toast.error(`${failed} envoi(s) en échec sur ${sent + failed}.`);
    toast.success(`E-mail d'ouverture envoyé à ${pluralize(sent, "entreprise")}.`);
    router.refresh();
  }

  const status = !paymentsOpenOn ? "off" : active ? "on" : "open";

  return (
    <div className="rounded-lg border border-border bg-white p-5 lg:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-navy">Préinscription</h3>
        <Badge variant={status === "on" ? "pending" : status === "open" ? "active" : "draft"}>
          {status === "on"
            ? "En cours — paiements fermés"
            : status === "open"
              ? "Terminée — paiements ouverts"
              : "Désactivée"}
        </Badge>
      </div>
      <p className="mb-4 mt-1 text-xs text-text-muted">
        Jusqu&apos;à la date d&apos;ouverture, les entreprises créent leur compte, choisissent leur
        offre et indiquent leur nombre de participants, sans payer. Rien n&apos;est envoyé à Evolia
        avant le paiement.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="payments-open-day">Ouverture des paiements</Label>
          <Input
            id="payments-open-day"
            type="date"
            className="sm:w-[200px]"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </div>
        <Button onClick={() => save(day)} disabled={saving || day === (paymentsOpenOn ?? "")}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {paymentsOpenOn && (
          <Button variant="outline" onClick={() => save("")} disabled={saving}>
            Désactiver la préinscription
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        À minuit (heure de Madagascar) le jour choisi.
      </p>

      <div className="mt-4 flex flex-col gap-3 rounded-md bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-text-mid">
          <strong className="text-navy">{pluralize(preregisteredCount, "entreprise")}</strong> en
          attente de paiement.
          {openEmailSentAt && (
            <span className="block text-xs text-text-muted">
              E-mail d&apos;ouverture envoyé le {formatDateFr(openEmailSentAt)}.
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={status !== "open" || preregisteredCount === 0}
          onClick={() => setConfirmOpen(true)}
          title={status === "on" ? "Disponible une fois les paiements ouverts" : undefined}
        >
          Envoyer l&apos;e-mail d&apos;ouverture
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Envoyer l'e-mail d'ouverture ?"
        description={
          <>
            Chaque gestionnaire d&apos;une entreprise en attente de paiement (
            {pluralize(preregisteredCount, "entreprise")}) recevra « Les inscriptions sont ouvertes
            ». Le texte se modifie dans Admin › E-mails.
            {openEmailSentAt && " Il a déjà été envoyé une fois : ils le recevront à nouveau."}
          </>
        }
        confirmLabel="Envoyer"
        variant="gold"
        onConfirm={handleSend}
      />
    </div>
  );
}
