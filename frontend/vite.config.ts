import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const backend = process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // Nur lokal erreichbar; in Codespaces wird der Port privat weitergeleitet.
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Same-Origin wie später hinter dem Reverse Proxy: /api und /_allauth gehen an Django.
    proxy: {
      "/api": backend,
      "/_allauth": backend,
    },
  },
});
