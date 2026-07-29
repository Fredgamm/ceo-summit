// E9-T01 — iOS splash screens (apple-touch-startup-image). Generates one
// portrait PNG per device class (navy background, white-variant logo
// centered) for every entry in lib/apple-splash-devices.json, which is also
// consumed by lib/apple-splash-screens.ts (app/layout.tsx metadata links) —
// single source of truth for the device table. Run with
// `node scripts/generate-splash-screens.mjs`.
//
// Portrait-only: manifest.json declares "orientation": "portrait-primary",
// so landscape splash screens aren't needed. Device table assembled from a
// verified classic set (github.com/EvanBacon/7fd4dc3be3d00096579bb0b134c56ec7)
// plus modern iPhone 12-16 sizes cross-checked against published viewport
// references (dev-toolbox.tech, screensizechecker.com) — not scraped live
// from Apple's HIG, so treat as "best effort for common formats" rather
// than an exhaustive per-model guarantee.

import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/splash");
const LOGO = path.resolve(__dirname, "../public/logo/ceo-summit-logo-dark.png");
const NAVY = "#1A2B5F";

const require = createRequire(import.meta.url);
const DEVICES = require("../lib/apple-splash-devices.json");

async function buildSplash({ name, widthPt, heightPt, dpr }) {
  const width = widthPt * dpr;
  const height = heightPt * dpr;
  const logoWidth = Math.round(width * 0.42);
  const logoHeight = Math.round(logoWidth * (180 / 376));

  const logo = await sharp(LOGO).resize(logoWidth, logoHeight).toBuffer();

  await sharp({
    create: { width, height, channels: 4, background: NAVY },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT_DIR, `${name}.png`));

  console.log(`wrote ${name}.png (${width}x${height})`);
}

async function main() {
  for (const device of DEVICES) {
    await buildSplash(device);
  }
}

main();
