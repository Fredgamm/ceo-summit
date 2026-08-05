"use client";

import * as React from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * UC-11 (5 août 2026) — partage d'une offre self-service : lien profond
 * copiable + QR code, pour relayer une offre sur les réseaux sociaux ou en
 * évènement physique. Le QR code est généré côté serveur (page.tsx /
 * [id]/editer/page.tsx via `qrcode`) et transmis en data URL — pas besoin
 * de le regénérer côté client.
 */
export function PlanShareButton({ url, qrCodeDataUrl }: { url: string; qrCodeDataUrl: string }) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Partager
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Partager cette offre</DialogTitle>
          <DialogDescription>
            Ce lien pré-sélectionne l&apos;offre à l&apos;inscription — utile pour un post réseaux
            sociaux ou un QR code affiché en évènement.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <Image
            src={qrCodeDataUrl}
            alt="QR code de l'offre"
            width={180}
            height={180}
            unoptimized
          />
          <div className="flex w-full items-center gap-2">
            <Input readOnly value={url} onFocus={(e) => e.target.select()} />
            <Button type="button" onClick={handleCopy}>
              {copied ? "Copié !" : "Copier"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
