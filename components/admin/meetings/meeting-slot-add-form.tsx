"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { addMeetingSlot } from "@/app/actions/admin-meetings";
import { formatDayKey } from "@/lib/event-timezone";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

/** Module 21 lot 2 — ajout manuel d'un créneau, dans les jours de l'événement. */
export function MeetingSlotAddForm({
  eventId,
  eventDays,
}: {
  eventId: string;
  eventDays: string[];
}) {
  const router = useRouter();
  const [day, setDay] = React.useState(eventDays[0] ?? "");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await addMeetingSlot(eventId, { day, start, end });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setStart("");
      setEnd("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_120px_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slot-day">Jour</Label>
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger id="slot-day">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eventDays.map((d) => (
                <SelectItem key={d} value={d}>
                  {formatDayKey(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slot-start">Début</Label>
          <Input
            id="slot-start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slot-end">Fin</Label>
          <Input
            id="slot-end"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="outline" disabled={saving}>
          Ajouter
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
