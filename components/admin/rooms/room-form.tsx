"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { RoomAccessLevel } from "@prisma/client";

import { createRoom, updateRoom } from "@/app/actions/admin-rooms";
import { ROOM_ACCESS_LABEL } from "@/lib/rooms-query";
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

const ACCESS_LEVELS = Object.entries(ROOM_ACCESS_LABEL) as [RoomAccessLevel, string][];

export interface RoomFormValues {
  name: string;
  description: string;
  sector: string;
  minTier: RoomAccessLevel;
}

const EMPTY_VALUES: RoomFormValues = {
  name: "",
  description: "",
  sector: "",
  minTier: "ALL_MEMBERS",
};

interface RoomFormProps {
  mode: "create" | "edit";
  roomId?: string;
  initialValues?: Partial<RoomFormValues>;
  /** Référentiel admin-éditable (E8-T11, 5 août 2026) — fourni par la page serveur parente. */
  sectors: string[];
}

/** E8-T08 — "CRUD salles + gestion accès tier". */
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
          <Select value={values.sector} onValueChange={(v) => set("sector", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Accès minimum *</Label>
          <Select
            value={values.minTier}
            onValueChange={(v) => set("minTier", v as RoomAccessLevel)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_LEVELS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
