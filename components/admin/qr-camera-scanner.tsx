"use client";

import * as React from "react";
import jsQR from "jsqr";

interface QrCameraScannerProps {
  /** Appelé à chaque QR code décodé (peut être appelé plusieurs fois pour le même code après le délai de pause). */
  onScan: (data: string) => void;
  /** Pause après un scan réussi, pour éviter de redéclencher en boucle sur le même badge. Défaut 2000ms. */
  cooldownMs?: number;
}

/**
 * E10 (5 août 2026) — check-in par scan caméra, en remplacement/complément
 * de la saisie manuelle du code (voir components/admin/checkin-scanner.tsx).
 * Décodage côté client via `jsqr` (aucun envoi de flux vidéo au serveur) :
 * une boucle `requestAnimationFrame` dessine chaque frame de la vidéo sur
 * un canvas hors-écran, puis tente un décodage QR sur les pixels obtenus.
 *
 * Caméra arrière préférée (`facingMode: environment`, pertinent sur mobile/
 * tablette — le matériel probable à l'accueil d'un évènement). En échec de
 * permission/matériel, expose une erreur lisible ; à l'appelant de proposer
 * un repli (ici, la saisie manuelle déjà existante).
 */
export function QrCameraScanner({ onScan, cooldownMs = 2000 }: QrCameraScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const onScanRef = React.useRef(onScan);
  onScanRef.current = onScan;

  const [error, setError] = React.useState<string | null>(null);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    let cancelled = false;
    let pausedUntil = 0;

    function tick() {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const now = Date.now();
        if (now >= pausedUntil) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });
            if (code?.data) {
              onScanRef.current(code.data);
              pausedUntil = now + cooldownMs;
              setPaused(true);
              setTimeout(() => setPaused(false), cooldownMs);
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Accès à la caméra refusé — autorisez-le dans les réglages du navigateur, ou utilisez la saisie manuelle ci-dessous."
            : "Caméra indisponible sur cet appareil — utilisez la saisie manuelle ci-dessous."
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cooldownMs]);

  if (error) {
    return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-lg bg-black">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- flux caméra live, pas un média avec piste audio/sous-titres */}
      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-navy">
            Scanné ✓
          </span>
        </div>
      )}
    </div>
  );
}
