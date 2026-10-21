"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { testBrevoConnection, updateBrevoSettings } from "@/app/actions/admin-brevo";
import type { BrevoAccountStatus } from "@/lib/brevo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { formatDateFr } from "@/lib/utils";

/** Ce que la page serveur transmet : jamais la clé elle-même. */
export interface BrevoSettingsStatus {
  source: "admin" | "env" | "none";
  /** « …ab12 » */
  keyHint: string | null;
  unreadable: boolean;
  updatedAt: string | null;
  senderEmail: string;
  senderName: string;
  ready: boolean;
}

const SOURCE_LABEL: Record<BrevoSettingsStatus["source"], string> = {
  admin: "Saisie ici",
  env: "Variable d'environnement",
  none: "Non configurée",
};

/**
 * 21 oct. 2026 — Brevo pour les communications (diffusions de
 * /admin/communications). Clé en écriture seule, comme la clé Evolia.
 */
export function BrevoSettings({ status }: { status: BrevoSettingsStatus }) {
  const router = useRouter();
  const [apiKey, setApiKey] = React.useState("");
  const [clearApiKey, setClearApiKey] = React.useState(false);
  const [senderEmail, setSenderEmail] = React.useState(status.senderEmail);
  const [senderName, setSenderName] = React.useState(status.senderName);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [account, setAccount] = React.useState<BrevoAccountStatus | null>(null);

  const canClear = status.source === "admin" || status.unreadable;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await updateBrevoSettings({
        apiKey,
        clearApiKey,
        senderEmail,
        senderName,
        currentPassword,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.changed.length > 0
          ? `Configuration Brevo enregistrée (${result.data.changed.join(", ")}).`
          : "Aucune modification."
      );
      setApiKey("");
      setClearApiKey(false);
      setAccount(null);
      router.refresh();
    } finally {
      setCurrentPassword("");
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const result = await testBrevoConnection();
      if (!result.success) {
        setAccount(null);
        toast.error(result.error);
        return;
      }
      setAccount(result.data);
      toast.success("Connexion à Brevo réussie.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-navy">Brevo — envoi des communications</h3>
        <Badge variant={status.ready ? "active" : "pending"}>
          {status.ready ? "● Connecté" : "Non configuré"}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        Les diffusions d&apos;Admin › Communications partent par Brevo, par envois groupés de 1000
        destinataires. Les e-mails automatiques (mot de passe, paiements…) restent sur la boîte
        ceo-summit.mg. Sans clé, les diffusions repartent par cette boîte.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="brevo-api-key">Clé d&apos;API Brevo</Label>
            <span className="text-xs text-text-muted">{SOURCE_LABEL[status.source]}</span>
          </div>
          <p className="mb-1.5 mt-0.5 text-xs text-text-muted">
            {status.unreadable ? (
              <span className="font-semibold text-red-600">
                Clé enregistrée illisible (secret du serveur changé) — ressaisissez-la.
              </span>
            ) : (
              <>
                Dans Brevo : SMTP &amp; API › Clés API.
                {status.keyHint && <> Actuelle : se termine par {status.keyHint}</>}
                {status.updatedAt && <>, modifiée le {formatDateFr(new Date(status.updatedAt))}</>}
                {status.keyHint && "."}
              </>
            )}
          </p>
          <PasswordInput
            id="brevo-api-key"
            autoComplete="new-password"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value.trim());
              if (e.target.value) setClearApiKey(false);
            }}
            placeholder="xkeysib-… (vide = conserver)"
            className="font-mono"
          />
          {canClear && (
            <label className="mt-2 flex items-center gap-2 text-xs text-text-mid">
              <input
                type="checkbox"
                checked={clearApiKey}
                disabled={Boolean(apiKey)}
                onChange={(e) => setClearApiKey(e.target.checked)}
              />
              Supprimer la clé saisie ici
            </label>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="brevo-sender-email">Adresse d&apos;expéditeur</Label>
            <Input
              id="brevo-sender-email"
              type="email"
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              placeholder="hello@ceo-summit.mg"
            />
            <p className="mt-1 text-xs text-text-muted">
              Doit être validée dans votre compte Brevo.
            </p>
          </div>
          <div>
            <Label htmlFor="brevo-sender-name">Nom d&apos;expéditeur</Label>
            <Input
              id="brevo-sender-name"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="CEO Summit Indian Ocean"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface px-3 py-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testing || status.source === "none"}
          >
            {testing ? "Test en cours…" : "Tester la connexion"}
          </Button>
          {account ? (
            <p className="text-xs text-text-mid">
              Compte <strong className="text-navy">{account.email}</strong>
              {account.credits.length > 0 && (
                <>
                  {" · "}
                  {account.credits
                    .map(
                      (c) =>
                        `${new Intl.NumberFormat("fr-FR").format(c.credits)} crédits (${c.type})`
                    )
                    .join(", ")}
                </>
              )}
            </p>
          ) : (
            <p className="text-xs text-text-muted">
              Vérifie la clé enregistrée et affiche les crédits d&apos;envoi restants.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="brevo-current-password">Votre mot de passe (confirmation)</Label>
            <PasswordInput
              id="brevo-current-password"
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
