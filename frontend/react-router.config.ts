import type { Config } from "@react-router/dev/config";

export default {
  // Serverseitiges Rendering (ADR 0002). Keine experimentellen Features (RSC, unstable_*).
  ssr: true,
} satisfies Config;
