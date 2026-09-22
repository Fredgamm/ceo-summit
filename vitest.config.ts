import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  // 22 septembre 2026 — sans ça, esbuild transforme les .tsx (emails/*)
  // importés par les tests en JSX classique (React.createElement) sans
  // jamais importer React, faisant planter tout template email fraîchement
  // compilé ("React is not defined") — masqué jusqu'ici pour les anciens
  // templates par un cache de transform stale. tsconfig.json a `jsx:
  // "preserve"` (lu par Next.js/SWC, pas par esbuild) ; ceci force le même
  // runtime automatique que Next.js utilise réellement en prod.
  esbuild: { jsx: "automatic" },
});
