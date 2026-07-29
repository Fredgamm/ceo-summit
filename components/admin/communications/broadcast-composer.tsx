"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { BroadcastSegment } from "@prisma/client";

import {
  getSegmentCounts,
  getCustomSegmentCount,
  sendBroadcast,
  sendTestBroadcast,
} from "@/app/actions/broadcasts";
import { SEGMENT_LABEL } from "@/lib/broadcast-segments";
import { SECTORS } from "@/lib/sectors";
import { COUNTRIES } from "@/lib/countries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

/** E8-T09 — composer un broadcast : segment, aperçu, envoi test, envoi réel. */
export function BroadcastComposer() {
  const router = useRouter();
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [segment, setSegment] = React.useState<BroadcastSegment>("ALL_ACTIVE");
  const [country, setCountry] = React.useState("");
  const [sector, setSector] = React.useState("");
  const [counts, setCounts] = React.useState<{
    ALL_ACTIVE: number;
    CHAIRMAN: number;
    EXECUTIVE: number;
  } | null>(null);
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
    getCustomSegmentCount(country || undefined, sector || undefined).then((res) => {
      if (res.success) setCustomCount(res.data.count);
    });
  }, [segment, country, sector]);

  const recipientCount =
    segment === "CUSTOM"
      ? (customCount ?? "…")
      : segment === "ALL_ACTIVE"
        ? (counts?.ALL_ACTIVE ?? "…")
        : segment === "CHAIRMAN"
          ? (counts?.CHAIRMAN ?? "…")
          : (counts?.EXECUTIVE ?? "…");

  async function handleTest() {
    setError(null);
    setTesting(true);
    setTestSent(false);
    try {
      const result = await sendTestBroadcast(subject, body);
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
      sector || undefined
    );
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSentInfo(
      `Message envoyé à ${result.data.recipientCount} membre${result.data.recipientCount !== 1 ? "s" : ""}.`
    );
    setSubject("");
    setBody("");
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
              <strong>{"{{tier}}"}</strong>, <strong>{"{{entreprise}}"}</strong>
            </AlertDescription>
          </Alert>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-navy">Destinataires</h3>
          <div className="flex flex-col gap-2">
            {(["ALL_ACTIVE", "CHAIRMAN", "EXECUTIVE", "CUSTOM"] as BroadcastSegment[]).map((s) => (
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
                    <p className="text-xs text-text-muted">
                      {s === "ALL_ACTIVE"
                        ? (counts?.ALL_ACTIVE ?? "…")
                        : s === "CHAIRMAN"
                          ? (counts?.CHAIRMAN ?? "…")
                          : (counts?.EXECUTIVE ?? "…")}{" "}
                      membres
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {segment === "CUSTOM" && (
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              <Select value={country || ALL} onValueChange={(v) => setCountry(v === ALL ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous pays" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tous pays</SelectItem>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sector || ALL} onValueChange={(v) => setSector(v === ALL ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous secteurs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tous secteurs</SelectItem>
                  {SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
