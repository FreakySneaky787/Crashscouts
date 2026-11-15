import type { Config } from "@react-router/dev/config";

// Behind the reverse proxy the SSR server sees "http://<host>" while browsers send
// "Origin: https://<host>": React Router would refuse every form action. The public host is
// therefore allowed explicitly, read at build time (question P, ADR 0032). Unset in development.
const allowedActionOrigins = process.env.ALLOWED_ACTION_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export default {
  // Server-side rendering (ADR 0002). No experimental features (RSC, unstable_*).
  ssr: true,
  ...(allowedActionOrigins?.length ? { allowedActionOrigins } : {}),
} satisfies Config;
