# Frontend (React Router SSR)

React 19 · React Router 8 (framework mode, server-side rendering) · Vite 8 · TypeScript 6.0 ·
react-i18next · Vitest · ESLint · package management with pnpm. Requires Node ≥ 22.22.

## Layout

```
frontend/
├── app/
│   ├── root.tsx               layout, navigation, error boundary
│   ├── routes.ts              route configuration
│   ├── routes/                route modules (loader, action, headers, meta, component)
│   ├── entry.server.tsx       CSP with nonce (production build), security headers, cache defaults
│   ├── lib/backend.server.ts  server-only access to the Django API
│   ├── lib/http.ts            pure helpers: cache headers, cookies, redirects, UUIDs (+ tests)
│   ├── lib/theme.ts           theme cookie (system/light/dark) (+ tests)
│   ├── styles/                design tokens (light/dark) and base styles
│   ├── components/ui/         design system components, CSS Modules, icons.ts, statuses.ts
│   ├── components/layout/     AppShell (sidebar, top bar, mobile menu)
│   ├── i18n/                  react-i18next, one instance per request, typed keys (+ tests)
│   └── config/brand.ts        central brand name ("Crashscouts", decided 2026-11-15)
├── react-router.config.ts     `ssr: true`
├── vite.config.ts             dev server on 127.0.0.1:5173, proxies /api and /_allauth to Django
└── vitest.config.ts
```

## Running locally

The backend must be running (see [`backend/README.md`](../backend/README.md)).

```bash
pnpm install
```

```bash
pnpm dev
```

The dev server runs on `http://127.0.0.1:5173`; open it as `http://localhost:5173` (passkeys reject
IP addresses, and `FRONTEND_URL` defaults to localhost). The CSP is only applied in the production build,
because the Vite dev server needs inline scripts.

Production build (as used by the E2E tests):

```bash
pnpm build
```

```bash
HOST=127.0.0.1 PORT=3000 BACKEND_INTERNAL_URL=http://127.0.0.1:8000 pnpm start
```

For a production build on another origin, Django must trust it:
`DJANGO_CSRF_TRUSTED_ORIGINS=http://localhost:3000` and `FRONTEND_URL=http://localhost:3000`.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## Rules for routes

- Pages with user-specific or private data use `privateNoStoreHeaders()`; only anonymous public
  pages may use `cacheHeadersFor(request)`. Without an explicit choice, `entry.server.tsx` sets
  `private, no-store`.
- Public pages must never pass backend `Set-Cookie` headers on.
- Validate URL parameters (`isUuid`) before putting them into backend paths.
- Redirect targets from user input go through `safeRedirectPath`.
- Forms that write carry the CSRF token (`ensureCsrfToken` in the loader, hidden field
  `csrf_token`).
- No `dangerouslySetInnerHTML` (enforced by ESLint).
- Security settings answer 401 "reauthenticate" when a fresh password confirmation is due; send the
  user to `/reauthenticate?next=…` (see `routes/settings-security.tsx`).
- Passkeys run in the browser (`lib/passkeys.ts`) and talk only to the resource route `/passkeys`,
  which forwards to allauth; controls render after hydration (`lib/use-hydrated.ts`).

## Rules for UI

Full reference: [`docs/DESIGN-SYSTEM.md`](../docs/DESIGN-SYSTEM.md); living examples at
`/design-system`.

- Build pages from `app/components/ui/`; style with CSS Modules and tokens from
  `app/styles/tokens.css` – no literal colours.
- No `style` attribute (blocked by the CSP; enforced by ESLint).
- Icons only from `app/components/ui/icons.ts`; status always as icon + text (`StatusPill`).
- Tabs and filters are links; every list has an `EmptyState`.
- UI texts go into `app/i18n/locales/en.json`.
