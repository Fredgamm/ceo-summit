"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ReportStatus } from "@prisma/client";

import { resolveRoomReport } from "@/app/actions/admin-rooms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: "RESOLVED_DELETED", label: "Supprimer le message" },
  { value: "RESOLVED_WARNED", label: "Avertir le membre" },
  { value: "RESOLVED_EXCLUDED", label: "Exclure de la salle" },
  { value: "DISMISSED", label: "Ignorer (faux positif)" },
];

interface RoomReportDialogProps {
  reportId: string;
  roomName: string;
  reporterName: string;
  messageContent: string;
}

/** E4-T04 — modal de traitement d'un signalement, mêmes 4 issues que bo-salles.html. */
export function RoomReportDialog({
  reportId,
  roomName,
  reporterName,
  messageContent,
}: RoomReportDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [decision, setDecision] = React.useState<ReportStatus>("RESOLVED_DELETED");
  const [days, setDays] = React.useState("7");
  const [loading, setLoading] = React.useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const result = await resolveRoomReport(
        reportId,
        decision,
        decision === "RESOLVED_EXCLUDED" ? parseInt(days, 10) : undefined
      );
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        🚨 Traiter
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signalement — {roomName}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <div className="rounded-md bg-surface p-3 text-sm italic text-text-mid">
                  &ldquo;{messageContent}&rdquo;
                </div>
                <p className="text-xs text-text-muted">Signalé par {reporterName}</p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <RadioGroup value={decision} onValueChange={(v) => setDecision(v as ReportStatus)}>
            {OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <RadioGroupItem value={opt.value} id={opt.value} />
                <Label htmlFor={opt.value} className="cursor-pointer text-sm font-normal">
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {decision === "RESOLVED_EXCLUDED" && (
            <div>
              <Label htmlFor="days" className="text-xs">
                Durée de la suspension (jours)
              </Label>
              <Input
                id="days"
                type="number"
                min={1}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="mt-1 w-24"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Annuler
            </Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? "Traitement…" : "Appliquer la décision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
