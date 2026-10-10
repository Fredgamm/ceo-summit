"use client";

import * as React from "react";
import { Download, MoreVertical, Share, SquarePlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { promptPwaInstall, usePwaInstall } from "@/lib/pwa-install";

/**
 * Entrée de menu « Installer l'application » (10 oct. 2026), visible tant que
 * l'application n'est pas installée. Ouvre la fenêtre d'installation du
 * navigateur quand elle est disponible ; sinon, explique la marche à suivre
 * selon l'appareil.
 */
export function InstallAppButton({
  className,
  label = "Installer l'application",
  iconClassName = "h-4 w-4 shrink-0",
  children,
}: {
  className?: string;
  label?: string;
  iconClassName?: string;
  /** Contenu personnalisé du bouton (sinon icône + libellé). */
  children?: React.ReactNode;
}) {
  const { installed, canPrompt, platform } = usePwaInstall();
  const [helpOpen, setHelpOpen] = React.useState(false);

  if (installed) return null;

  async function handleClick() {
    if (canPrompt) {
      const outcome = await promptPwaInstall();
      if (outcome !== "unavailable") return;
    }
    setHelpOpen(true);
  }

  return (
    <>
      <button type="button" onClick={handleClick} className={className} aria-label={label}>
        {children ?? (
          <>
            <Download className={iconClassName} strokeWidth={2} />
            <span>{label}</span>
          </>
        )}
      </button>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Installer CEO Summit</DialogTitle>
            <DialogDescription>
              L&apos;application s&apos;ouvre ensuite depuis votre écran d&apos;accueil, comme une
              application classique.
            </DialogDescription>
          </DialogHeader>
          {platform === "ios" ? (
            <ol className="flex flex-col gap-3 text-sm text-text-mid">
              <li className="flex gap-3">
                <Step n={1} />
                <span>
                  Ouvrez ce site dans <strong>Safari</strong>, puis touchez le bouton Partager{" "}
                  <Share className="inline h-4 w-4 text-navy" />.
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={2} />
                <span>
                  Choisissez <strong>« Sur l&apos;écran d&apos;accueil »</strong>{" "}
                  <SquarePlus className="inline h-4 w-4 text-navy" />, puis <strong>Ajouter</strong>
                  .
                </span>
              </li>
            </ol>
          ) : (
            <ol className="flex flex-col gap-3 text-sm text-text-mid">
              <li className="flex gap-3">
                <Step n={1} />
                <span>
                  Sur ordinateur, avec <strong>Chrome</strong> ou <strong>Edge</strong> : cliquez
                  sur l&apos;icône d&apos;installation à droite de la barre d&apos;adresse.
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={2} />
                <span>
                  Sur Android, avec <strong>Chrome</strong> : ouvrez le menu{" "}
                  <MoreVertical className="inline h-4 w-4 text-navy" /> puis{" "}
                  <strong>« Installer l&apos;application »</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={3} />
                <span>
                  Avec Firefox ou un autre navigateur, l&apos;installation n&apos;est pas proposée :
                  ouvrez app.ceo-summit.mg dans Chrome, Edge ou Safari.
                </span>
              </li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
      {n}
    </span>
  );
}
