"use client";

import * as React from "react";

import { acceptCompanyInvite } from "@/app/actions/company-invites";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token, email }: { token: string; email: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function handleAccept() {
    setError(null);
    setLoading(true);
    try {
      const result = await acceptCompanyInvite(token);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Alert variant="success">
        <AlertDescription>
          Un email de confirmation vient d&apos;être envoyé à {email}. Cliquez sur le lien
          qu&apos;il contient pour choisir votre mot de passe.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button onClick={handleAccept} disabled={loading} className="w-full justify-center">
        {loading ? "Création…" : "Accepter l'invitation"}
      </Button>
    </div>
  );
}
