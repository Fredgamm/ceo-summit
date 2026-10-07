"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { createRoom, updateRoom } from "@/app/actions/admin-rooms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReferentialSelect } from "@/components/referentials/referential-select";

export interface RoomFormValues {
  name: string;
  description: string;
  sector: string;
}

const EMPTY_VALUES: RoomFormValues = {
  name: "",
  description: "",
  sector: "",
};

interface RoomFormProps {
  mode: "create" | "edit";
  roomId?: string;
  initialValues?: Partial<RoomFormValues>;
  /** Référentiel admin-éditable (E8-T11, 5 août 2026) — fourni par la page serveur parente. */
  sectors: string[];
}

/** E8-T08 — "CRUD salles". */
export function RoomForm({ mode, roomId, initialValues, sectors }: RoomFormProps) {
  const router = useRouter();
  const [values, setValues] = React.useState<RoomFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function set<K extends keyof RoomFormValues>(key: K, value: RoomFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createRoom(values);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push("/admin/salles");
      } else {
        const result = await updateRoom(roomId!, values);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push("/admin/salles");
      }
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-[560px] rounded-lg border border-border bg-white p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="room-name">Nom de la salle *</Label>
          <Input
            id="room-name"
            placeholder="ex. BTP & Infrastructure"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={80}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="room-desc">Description</Label>
          <Textarea
            id="room-desc"
            placeholder="Sous-titre de la salle"
            rows={3}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={280}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Secteur *</Label>
          <ReferentialSelect
            options={sectors}
            value={values.sector}
            onValueChange={(v) => set("sector", v)}
            placeholder="Sélectionner…"
            searchTitle="Rechercher un secteur"
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSubmit} disabled={submitting} className="justify-center">
          {submitting ? "Enregistrement…" : mode === "create" ? "✓ Créer la salle" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
