import { defineConfig } from "vitest/config";

// Eigene Konfiguration ohne React-Router-Vite-Plugin: Unit-Tests für Hilfsfunktionen.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    environment: "node",
  },
});
