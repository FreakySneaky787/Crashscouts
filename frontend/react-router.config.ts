import type { Config } from "@react-router/dev/config";

export default {
  // Server-side rendering (ADR 0002). No experimental features (RSC, unstable_*).
  ssr: true,
} satisfies Config;
