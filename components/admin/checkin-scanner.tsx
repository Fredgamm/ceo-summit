"use client";

import * as React from "react";

import { checkInRegistration } from "@/app/actions/admin-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * E3-T04 — check-in admin. The code is typed or pasted, not scanned by a
 * camera — a QR reader library (e.g. a device camera + decode) is a UI
 * enhancement for later; the check-in logic itself (validate + mark
 * checkedIn) is real and complete either way.
 */
export function CheckinScanner({ eventId }: { eventId: string }) {
  const [code, setCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<
    | { kind: "success"; name: string; alreadyCheckedIn: boolean }
    | { kind: "error"; message: string }
    | null
  >(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await checkInRegistration(eventId, code.trim());
      if (!res.success) {
        setResult({ kind: "error", message: res.error });
      } else {
        setResult({
          kind: "success",
          name: res.data.name,
          alreadyCheckedIn: res.data.alreadyCheckedIn,
        });
      }
    } finally {
      setLoading(false);
      setCode("");
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mx-auto max-w-[420px]">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
