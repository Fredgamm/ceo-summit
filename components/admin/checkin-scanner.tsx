"use client";

import * as React from "react";

import { checkInRegistration } from "@/app/actions/admin-events";
import { QrCameraScanner } from "@/components/admin/qr-camera-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type CheckinResult =
  { kind: "success"; name: string; alreadyCheckedIn: boolean } | { kind: "error"; message: string };

/**
 * E3-T04 (check-in), scan caméra ajouté le 5 août 2026 (E10) —
 * `checkInRegistration` reste inchangé : il valide déjà n'importe quelle
 * chaîne contre `EventRegistration.badgeQrCode`, que le code arrive scanné
 * ou tapé. La caméra est le mode par défaut (le cas d'usage principal —
 * accueil d'un évènement, beaucoup de badges à enchaîner) ; la saisie
 * manuelle reste accessible en repli (permission caméra refusée, matériel
 * indisponible, badge imprimé illisible).
 */
export function CheckinScanner({ eventId }: { eventId: string }) {
  const [mode, setMode] = React.useState<"camera" | "manual">("camera");
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<CheckinResult | null>(null);
  const inFlightRef = React.useRef(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function submitCode(rawCode: string) {
    const trimmed = rawCode.trim();
    if (!trimmed || inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setResult(null);
    try {
      const res = await checkInRegistration(eventId, trimmed);
      setResult(
        res.success
          ? { kind: "success", name: res.data.name, alreadyCheckedIn: res.data.alreadyCheckedIn }
          : { kind: "error", message: res.error }
      );
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
