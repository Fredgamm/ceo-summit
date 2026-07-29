import devices from "./apple-splash-devices.json";

/**
 * E9-T01 — shared device table for iOS splash screens
 * (apple-touch-startup-image), consumed by both app/layout.tsx (metadata
 * links) and scripts/generate-splash-screens.mjs (image generation) so the
 * two never drift apart. See apple-splash-devices.json for the data and
 * its sourcing notes.
 */
export interface SplashDevice {
  name: string;
  widthPt: number;
  heightPt: number;
  dpr: number;
}

export const SPLASH_DEVICES: SplashDevice[] = devices;

export function splashMediaQuery(device: SplashDevice): string {
  return `(device-width: ${device.widthPt}px) and (device-height: ${device.heightPt}px) and (-webkit-device-pixel-ratio: ${device.dpr}) and (orientation: portrait)`;
}
