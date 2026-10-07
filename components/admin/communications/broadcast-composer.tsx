"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  getSegmentCounts,
  getCustomSegmentCount,
  sendBroadcast,
  sendTestBroadcast,
} from "@/app/actions/broadcasts";
import { SEGMENT_LABEL, type SendableSegment } from "@/lib/broadcast-segments";
import { pluralize } from "@/lib/utils";
import {
  BROADCAST_ATTACHMENT_ALLOWED_MIME_TYPES,
  BROADCAST_ATTACHMENT_MAX_COUNT,
} from "@/lib/validations/broadcast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReferentialSelect } from "@/components/referentials/referential-select";

const ALL = "__all__";

/**
 * Ciblage par une ou plusieurs offres via CUSTOM. L'enum Prisma garde
 * CHAIRMAN/EXECUTIVE pour l'historique des broadcasts déjà envoyés.
 */
const SELECTABLE_SEGMENTS: SendableSegment[] = ["ALL_ACTIVE", "CUSTOM"];

/**
 * E8-T09 — composer un broadcast : segment, aperçu, envoi test, envoi réel.
 * `sectors`/`countries`/`plans` (E8-T11, 5 août 2026 ; `plans` ajouté le
 * 1er oct. 2026 §3.2b) fournis par la page serveur parente, pour le
 * sous-filtre du segment CUSTOM.
 */
export function BroadcastComposer({
  sectors,
  countries,
  plans,
}: {
  sectors: string[];
  countries: string[];
  plans: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [segment, setSegment] = React.useState<SendableSegment>("ALL_ACTIVE");
  const [country, setCountry] = React.useState("");
  const [sector, setSector] = React.useState("");
  const [planIds, setPlanIds] = React.useState<string[]>([]);
  const [attachments, setAttachments] = React.useState<{ key: string; name: string }[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<{ ALL_ACTIVE: number } | null>(null);
  const [customCount, setCustomCount] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [testSent, setTestSent] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [sentInfo, setSentInfo] = React.useState<string | null>(null);

  React.useEffect(() => {
    getSegmentCounts().then((res) => {
      if (res.success) setCounts(res.data);
    });
  }, []);

  React.useEffect(() => {
    if (segment !== "CUSTOM") return;
    getCustomSegmentCount(country || undefined, sector || undefined, planIds).then((res) => {
      if (res.success) setCustomCount(res.data.count);
    });
  }, [segment, country, sector, planIds]);

  function togglePlan(planId: string) {
    setPlanIds((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId]
    );
  }

  const recipientCount = segment === "CUSTOM" ? (customCount ?? "…") : (counts?.ALL_ACTIVE ?? "…");

  async function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (attachments.length >= BROADCAST_ATTACHMENT_MAX_COUNT) {
      setUploadError(`Maximum ${BROADCAST_ATTACHMENT_MAX_COUNT} pièces jointes.`);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/broadcasts/attachment", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error ?? "Échec de l'envoi.");
        return;
      }
      setAttachments((prev) => [...prev, json.data]);
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(key: string) {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }

  async function handleTest() {
    setError(null);
    setTesting(true);
    setTestSent(false);
    try {
      const result = await sendTestBroadcast(subject, body, attachments);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setTestSent(true);
    } finally {
      setTesting(false);
    }
  }

  async function handleSend() {
    setError(null);
    const result = await sendBroadcast(
      subject,
      body,
      segment,
      country || undefined,
      sector || undefined,
      planIds,
      attachments
    );
    if (!result.success) {
      setError(result.error);
      return;
    }
    const { recipientCount, failedCount } = result.data;
    if (failedCount > 0) {
      setError(
        `${failedCount} envoi${failedCount > 1 ? "s" : ""} sur ${recipientCount} en échec — vérifier la configuration email du serveur.`
      );
    }
    const deliveredCount = recipientCount - failedCount;
    setSentInfo(`Message envoyé à ${pluralize(deliveredCount, "membre")}.`);
    setSubject("");
    setBody("");
    setAttachments([]);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
      <div className="rounded-lg border border-border bg-white p-6">
        <h2 className="mb-4 text-base font-bold text-navy">Composer le message</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bc-subject">Objet de l&apos;email *</Label>
            <Input
              id="bc-subject"
              placeholder="ex. CEO Summit 2026 — Dernières places disponibles"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={140}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bc-body">Corps du message *</Label>
            <Textarea
              id="bc-body"
              rows={12}
              placeholder="Votre message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <Alert variant="gold">
            <AlertDescription>
              Variables disponibles : <strong>{"{{prénom}}"}</strong>, <strong>{"{{nom}}"}</strong>,{" "}
              <strong>{"{{entreprise}}"}</strong>
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bc-attachment">Pièces jointes (optionnel)</Label>
            <Input
              id="bc-attachment"
              type="file"
              accept={BROADCAST_ATTACHMENT_ALLOWED_MIME_TYPES.join(",")}
              onChange={handleAttachmentChange}
              disabled={uploading || attachments.length >= BROADCAST_ATTACHMENT_MAX_COUNT}
            />
            <p className="text-xs text-text-muted">
              Image ou PDF · 5 Mo max · {BROADCAST_ATTACHMENT_MAX_COUNT} fichiers max — insérées
              comme liens dans l&apos;email, pas en pièce jointe binaire.
            </p>
            {uploading && <p className="text-xs text-text-muted">Envoi…</p>}
            {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
            {attachments.length > 0 && (
              <ul className="flex flex-col gap-1">
                {attachments.map((a) => (
                  <li key={a.key} className="flex items-center gap-2 text-xs text-text-mid">
                    📎 {a.name}
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.key)}
                      className="text-red-600 underline-offset-2 hover:underline"
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-navy">Destinataires</h3>
          <div className="flex flex-col gap-2">
            {SELECTABLE_SEGMENTS.map((s) => (
              <label
                key={s}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md border-2 p-2.5 ${
                  segment === s ? "border-gold bg-gold-pale" : "border-border"
                }`}
              >
                <input type="radio" checked={segment === s} onChange={() => setSegment(s)} />
                <div>
                  <p className="text-sm font-semibold">{SEGMENT_LABEL[s]}</p>
                  {s !== "CUSTOM" && (
                    <p className="text-xs text-text-muted">{counts?.ALL_ACTIVE ?? "…"} membres</p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {segment === "CUSTOM" && (
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <ReferentialSelect
                options={countries}
                value={country || ALL}
                onValueChange={(v) => setCountry(v === ALL ? "" : v)}
                placeholder="Tous pays"
                searchTitle="Rechercher un pays"
                allOption={{ value: ALL, label: "Tous pays" }}
              />
              <ReferentialSelect
                options={sectors}
                value={sector || ALL}
                onValueChange={(v) => setSector(v === ALL ? "" : v)}
                placeholder="Tous secteurs"
                searchTitle="Rechercher un secteur"
                allOption={{ value: ALL, label: "Tous secteurs" }}
              />

              {plans.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
                  <p className="text-xs font-semibold text-text-mid">
                    Offres ({planIds.length ? planIds.length : "toutes"})
                  </p>
                  <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
                    {plans.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={planIds.includes(p.id)}
                          onChange={() => togglePlan(p.id)}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                  {planIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPlanIds([])}
                      className="self-start text-xs text-navy-mid underline-offset-2 hover:underline"
                    >
                      Tout désélectionner
                    </button>
                  )}
                </div>
              )}

              <p className="text-xs text-text-muted">{customCount ?? "…"} membres correspondants</p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-3 text-xs font-bold uppercase text-text-muted">
            Aperçu de l&apos;email
          </h3>
          <div className="rounded-md border border-border bg-white p-4 text-sm">
            <p className="mb-2 border-b-2 border-gold pb-2 font-bold text-navy">
              CEO Summit — Océan Indien
            </p>
            <p className="mb-2 font-semibold text-navy">{subject || "Objet de l'email"}</p>
            <p className="whitespace-pre-line text-text-mid">{body || "Corps du message…"}</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {testSent && (
          <Alert variant="success">
            <AlertDescription>Email de test envoyé à votre propre adresse.</AlertDescription>
          </Alert>
        )}
        {sentInfo && (
          <Alert variant="success">
            <AlertDescription>{sentInfo}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 justify-center"
            onClick={handleTest}
            disabled={testing || !subject.trim() || !body.trim()}
          >
            {testing ? "Envoi…" : "✉ Tester"}
          </Button>
          <Button
            className="flex-1 justify-center"
            onClick={() => setConfirmOpen(true)}
            disabled={!subject.trim() || !body.trim()}
          >
            Envoyer →
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmer l'envoi"
        description={
          <>
            Envoyer ce message à <strong>{recipientCount} membres</strong> ? Cette action est
            irréversible.
          </>
        }
        confirmLabel={`✉ Envoyer à ${recipientCount} membres`}
        onConfirm={handleSend}
      />
    </div>
  );
}
