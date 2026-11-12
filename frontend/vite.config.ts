import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const backend = process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // Local only; in Codespaces the port is forwarded privately.
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // Same origin as behind the production reverse proxy: /api and /_allauth go to Django.
    proxy: {
      "/api": backend,
      "/_allauth": backend,
    },
  },
});
