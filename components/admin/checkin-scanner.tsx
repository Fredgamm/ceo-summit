"use client";

import * as React from "react";

import { checkInRegistration } from "@/app/actions/admin-events";
import { getSocketClient } from "@/lib/socket-client";
import { QrCameraScanner } from "@/components/admin/qr-camera-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type CheckinResult =
  { kind: "success"; name: string; alreadyCheckedIn: boolean } | { kind: "error"; message: string };

interface CheckinUpdateEvent {
  checkpointId: string | null;
  checkpointName: string | null;
  at: number;
}

/**
 * E3-T04 (check-in), scan caméra ajouté le 5 août 2026 (E10) —
 * `checkInRegistration` reste inchangé : il valide déjà n'importe quelle
 * chaîne contre `EventRegistration.badgeQrCode`, que le code arrive scanné
 * ou tapé. La caméra est le mode par défaut (le cas d'usage principal —
 * accueil d'un évènement, beaucoup de badges à enchaîner) ; la saisie
 * manuelle reste accessible en repli (permission caméra refusée, matériel
 * indisponible, badge imprimé illisible).
 */
export function CheckinScanner({
  eventId,
  checkpoints = [],
}: {
  eventId: string;
  /** Contrôle d'accès multi-points (7 août 2026) — vide = pas de sélecteur affiché. */
  checkpoints?: { id: string; name: string }[];
}) {
  const [mode, setMode] = React.useState<"camera" | "manual">("camera");
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<CheckinResult | null>(null);
  const [checkpointId, setCheckpointId] = React.useState<string>(checkpoints[0]?.id ?? "");
  const [liveCounts, setLiveCounts] = React.useState<Record<string, number>>({});
  const inFlightRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  /**
   * Contrôle d'accès multi-points (7 août 2026) — "suivi en temps réel :
   * entrée et nombre de présence". Rejoint un salon dédié à cet évènement
   * (admin uniquement, vérifié côté serveur) et écoute les scans effectués
   * par N'IMPORTE QUEL poste ouvert sur ce même évènement, pas seulement
   * celui-ci — plusieurs postes physiques comptent ensemble en direct.
   */
  React.useEffect(() => {
    let active = true;
    let socketRef: Awaited<ReturnType<typeof getSocketClient>> | null = null;

    getSocketClient().then((socket) => {
      if (!active) return;
      socketRef = socket;
      socket.emit("checkin:join", eventId);
      socket.on("checkin:update", (evt: CheckinUpdateEvent) => {
        if (!evt.checkpointId) return;
        setLiveCounts((prev) => ({
          ...prev,
          [evt.checkpointId!]: (prev[evt.checkpointId!] ?? 0) + 1,
        }));
      });
    });

    return () => {
      active = false;
      socketRef?.off("checkin:update");
    };
  }, [eventId]);

  async function submitCode(rawCode: string) {
    const trimmed = rawCode.trim();
    if (!trimmed || inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setResult(null);
    try {
      const res = await checkInRegistration(eventId, trimmed, checkpointId || null);
      setResult(
        res.success
          ? { kind: "success", name: res.data.name, alreadyCheckedIn: res.data.alreadyCheckedIn }
          : { kind: "error", message: res.error }
      );
      if (res.success && !res.data.alreadyCheckedIn && checkpointId) {
        getSocketClient().then((socket) =>
          socket.emit("checkin:scan", {
            eventId,
            checkpointId,
            checkpointName: checkpoints.find((c) => c.id === checkpointId)?.name ?? null,
          })
        );
      }
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitCode(code);
    setCode("");
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto max-w-[420px]">
      {checkpoints.length > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          <Label htmlFor="checkin-checkpoint">Poste de contrôle</Label>
          <Select value={checkpointId} onValueChange={setCheckpointId}>
            <SelectTrigger id="checkin-checkpoint">
              <SelectValue placeholder="Sélectionner un poste…" />
            </SelectTrigger>
            <SelectContent>
              {checkpoints.map((cp) => (
                <SelectItem key={cp.id} value={cp.id}>
                  {cp.name}
                  {liveCounts[cp.id] ? ` — ${liveCounts[cp.id]} en direct` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mb-4 flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setMode((m) => (m === "camera" ? "manual" : "camera"));
            setResult(null);
          }}
        >
          {mode === "camera" ? "Saisir le code manuellement →" : "← Utiliser la caméra"}
        </Button>
      </div>

      {mode === "camera" ? (
        <QrCameraScanner onScan={submitCode} />
      ) : (
        <form onSubmit={handleManualSubmit} className="flex flex-col gap-3">
          <Label htmlFor="checkin-code">Code du badge</Label>
          <Input
            id="checkin-code"
            ref={inputRef}
            autoFocus
            placeholder="Coller ou saisir le code du badge…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" size="lg" className="w-full justify-center" disabled={loading}>
            {loading ? "Vérification…" : "Valider le check-in"}
          </Button>
        </form>
      )}

      {result?.kind === "success" && (
        <Alert variant="success" className="mt-4">
          <AlertDescription>
            {result.alreadyCheckedIn
              ? `${result.name} avait déjà fait son check-in.`
              : `${result.name} — check-in enregistré ✓`}
          </AlertDescription>
        </Alert>
      )}
      {result?.kind === "error" && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
