"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { transmitHeldEvoliaPushes, updateEvoliaSettings } from "@/app/actions/admin-evolia";
import type { EvoliaSettingsStatus, SettingSource } from "@/lib/evolia-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { formatDateFr } from "@/lib/utils";

const SOURCE_LABEL: Record<SettingSource, string> = {
  admin: "Saisie ici",
  env: "Variable d'environnement",
  default: "Valeur par défaut",
  none: "Non configurée",
};

/**
 * 21 oct. 2026 — configuration Evolia : les trois valeurs fournies par
 * Evolia (adresse d'envoi des inscriptions, lien de paiement, clé). La clé
 * est en écriture seule : le serveur n'en renvoie que les 4 derniers
 * caractères, un champ vide conserve la clé actuelle.
 */
export function EvoliaSettings({
  status,
  heldCount,
}: {
  status: EvoliaSettingsStatus;
  /** Envois retenus, et inscriptions en échec (réessayées par « Transmettre »). */
  heldCount: number;
}) {
  const router = useRouter();
  const [registrationUrl, setRegistrationUrl] = React.useState(status.registrationUrl.value);
  const [paymentUrl, setPaymentUrl] = React.useState(status.paymentUrl.value);
  const [secret, setSecret] = React.useState("");
  const [clearSecret, setClearSecret] = React.useState(false);
  const [live, setLive] = React.useState(status.live);
  const [transmitting, setTransmitting] = React.useState(false);

  async function handleTransmit() {
    setTransmitting(true);
    try {
      const result = await transmitHeldEvoliaPushes();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "Transmission lancée en arrière-plan. Rechargez la page dans quelques minutes pour suivre le nombre restant."
      );
      router.refresh();
    } finally {
      setTransmitting(false);
    }
  }
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const configured = status.secret.source !== "none" && !status.secret.unreadable;
  const canClear = status.secret.source === "admin" || status.secret.unreadable;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await updateEvoliaSettings({
        registrationUrl,
        paymentUrl,
        secret,
        clearSecret,
        live,
        currentPassword,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.changed.length > 0
          ? `Configuration Evolia enregistrée (${result.data.changed.join(", ")}).`
          : "Aucune modification."
      );
      if (result.data.releaseStarted) {
        toast.success(
          "Evolia activé : la transmission des envois retenus est lancée. Rechargez la page dans quelques minutes pour suivre le nombre restant."
        );
      }
      setSecret("");
      setClearSecret(false);
      router.refresh();
    } finally {
      // Ne jamais garder le mot de passe en mémoire du formulaire.
      setCurrentPassword("");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-navy">Evolia — inscriptions et paiements</h3>
        <Badge variant={configured && status.live ? "active" : "pending"}>
          {!configured ? "Non configuré" : status.live ? "● Activé" : "Envois retenus"}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        Valeurs fournies par Evolia, à recopier telles quelles. Prioritaires sur les variables
        d&apos;environnement du serveur ; une adresse laissée vide revient à la variable
        d&apos;environnement (ou à la valeur par défaut).
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <UrlField
          id="evolia-registration-url"
          label="Adresse d'envoi des inscriptions"
          value={registrationUrl}
          onChange={setRegistrationUrl}
          source={status.registrationUrl.source}
        />
        <UrlField
          id="evolia-payment-url"
          label="Lien de paiement"
          hint="Doit contenir {ceoSummitReference}, remplacé par la référence du paiement."
          value={paymentUrl}
          onChange={setPaymentUrl}
          source={status.paymentUrl.source}
        />

        <div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="evolia-secret">Clé Evolia</Label>
            <span className="text-xs text-text-muted">{SOURCE_LABEL[status.secret.source]}</span>
          </div>
          <p className="mb-1.5 mt-0.5 text-xs text-text-muted">
            {status.secret.unreadable ? (
              <span className="font-semibold text-red-600">
                Clé enregistrée illisible (secret du serveur changé) — ressaisissez-la.
              </span>
            ) : (
              <>
                Signe nos envois et vérifie leurs confirmations de paiement.
                {status.secret.hint && <> Actuelle : se termine par {status.secret.hint}</>}
                {status.secret.updatedAt && (
                  <>, modifiée le {formatDateFr(new Date(status.secret.updatedAt))}</>
                )}
                {status.secret.hint && "."}
              </>
            )}
          </p>
          <PasswordInput
            id="evolia-secret"
            autoComplete="new-password"
            spellCheck={false}
            value={secret}
            onChange={(e) => {
              // Un copier-coller emporte souvent un espace ou un retour à la ligne.
              setSecret(e.target.value.trim());
              if (e.target.value) setClearSecret(false);
            }}
            placeholder="Coller la clé fournie par Evolia (vide = conserver)"
            className="font-mono"
          />
          {canClear && (
            <label className="mt-2 flex items-center gap-2 text-xs text-text-mid">
              <input
                type="checkbox"
                checked={clearSecret}
                disabled={Boolean(secret)}
                onChange={(e) => setClearSecret(e.target.checked)}
              />
              Supprimer la clé saisie ici (revenir à la variable d&apos;environnement)
            </label>
          )}
        </div>

        <div className="rounded-md border border-border p-3">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
            />
            <span>
              <span className="font-semibold text-navy">
                Evolia activé (clé de production validée)
              </span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Désactivé : rien n&apos;est envoyé à Evolia (inscriptions et listes de participants
                sont retenues) et seuls le virement et le chèque sont proposés. À l&apos;activation,
                tous les envois retenus partent chez Evolia.
              </span>
            </span>
          </label>
          {!status.live && heldCount > 0 && (
            <p className="mt-2 text-xs font-semibold text-navy">
              {heldCount} envoi(s) retenu(s) partiront à l&apos;activation.
            </p>
          )}
          {status.live && heldCount > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-navy">
                {heldCount} envoi(s) retenu(s) ou inscription(s) en échec.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTransmit}
                disabled={transmitting}
              >
                {transmitting ? "Transmission…" : "Transmettre les envois retenus"}
              </Button>
            </div>
          )}
        </div>

        <p className="rounded-md bg-gold-pale px-3 py-2 text-xs text-text-mid">
          Ne remplacez la clé qu&apos;au moment où Evolia bascule sur la nouvelle : sinon leurs
          confirmations de paiement et nos envois seront refusés.
        </p>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="evolia-current-password">Votre mot de passe (confirmation)</Label>
            <PasswordInput
              id="evolia-current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={saving || !currentPassword}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function UrlField({
  id,
  label,
  hint,
  value,
  onChange,
  source,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  source: SettingSource;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs text-text-muted">{SOURCE_LABEL[source]}</span>
      </div>
      <Input
        id={id}
        type="url"
        inputMode="url"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://…"
      />
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
