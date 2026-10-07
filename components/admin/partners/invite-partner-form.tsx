"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { invitePartner } from "@/app/actions/admin-partners";
import { AddButton } from "@/components/ui/add-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

export interface PartnerOfferOption {
  id: string;
  name: string;
  /** Nombre de membres par défaut de l'offre (prérempli, modifiable). */
  defaultMembers: number;
}

/**
 * Module 20 — l'admin invite le gérant d'un partenaire : nom, e-mail et offre
 * obligatoires, nombre de membres prérempli avec celui de l'offre.
 */
export function InvitePartnerForm({ offers }: { offers: PartnerOfferOption[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [planId, setPlanId] = React.useState(offers.length === 1 ? offers[0].id : "");
  const [memberLimit, setMemberLimit] = React.useState(
    offers.length === 1 ? String(offers[0].defaultMembers) : "2"
  );
  const [counterpart, setCounterpart] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  function chooseOffer(id: string) {
    setPlanId(id);
    const offer = offers.find((o) => o.id === id);
    if (offer) setMemberLimit(String(offer.defaultMembers));
  }

  function reset() {
    setName("");
    setEmail("");
    setCounterpart("");
    setError(null);
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await invitePartner({ name, email, planId, memberLimit, counterpart });
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.data.warning) toast.warning(result.data.warning);
      else toast.success(`Invitation envoyée à ${email}.`);
      reset();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (offers.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Aucune offre partenaire active. Créez-en une dans Offres : montant 0, non proposée en
        libre-service.
      </p>
    );
  }

  if (!open) {
    return (
      <div>
        <AddButton onClick={() => setOpen(true)}>Inviter un partenaire</AddButton>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-lg border border-border bg-white p-5"
    >
      <h3 className="text-sm font-bold text-navy">Inviter un partenaire</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partner-name">Nom du gérant *</Label>
          <Input id="partner-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partner-email">E-mail du gérant *</Label>
          <Input
            id="partner-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partner-offer">Offre *</Label>
          <Select value={planId || undefined} onValueChange={chooseOffer}>
            <SelectTrigger id="partner-offer">
              <SelectValue placeholder="Choisir une offre partenaire" />
            </SelectTrigger>
            <SelectContent>
              {offers.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partner-members">Nombre de membres *</Label>
          <Input
            id="partner-members"
            type="number"
            min={1}
            value={memberLimit}
            onChange={(e) => setMemberLimit(e.target.value)}
          />
          <p className="text-xs text-text-muted">
            Collaborateurs que le gérant pourra inviter. Au-delà, il achète des places en
            supplément.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="partner-counterpart">Contrepartie (facultatif)</Label>
        <Textarea
          id="partner-counterpart"
          rows={3}
          placeholder="Services apportés en échange : visibilité, salle, couverture média…"
          value={counterpart}
          onChange={(e) => setCounterpart(e.target.value)}
          maxLength={2000}
        />
        <p className="text-xs text-text-muted">Visible de l&apos;équipe CEO Summit seulement.</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={reset} disabled={loading}>
          Annuler
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Envoi…" : "Envoyer l'invitation"}
        </Button>
      </div>
    </form>
  );
}
