# 0002 – Server-side rendering with React Router (framework mode)

- Status: Accepted; **validated on 2026-11-12** (WP 0.4: all six acceptance criteria pass)
- Date: 2026-11-12

## Context

Public project and campaign pages must be discoverable by search engines and show link previews
when shared (decided during planning). Google recommends server-side rendering, static rendering
or hydration, and calls dynamic rendering a workaround only. Not all bots execute JavaScript.

## Decision

- React Router in framework mode with `ssr: true` (Vite-based, React and TypeScript).
- A Node SSR server renders pages and fetches data from the Django API.
- Same origin behind a reverse proxy; Django remains the single source of data and
  authorization.
- No experimental features (RSC, `unstable_*`).

## Alternatives

- **Django templates for public pages plus a React SPA for the rest:** no Node in production,
  but two separate rendering stacks that must be maintained twice.
- **Next.js:** departs from the prescribed Vite stack and binds the project more tightly to one
  framework.
- **Plain SPA:** poor discoverability and poor link previews.

## Consequences

- One additional Node service in production.
- The critical points – forwarding `Cookie` and `Set-Cookie`, CSRF, protected SSR pages, cache
  headers – were validated in WP 0.4 with six automated acceptance criteria (Playwright,
  `e2e/tests/ssr-auth.spec.ts`).
- React Router 8 brings its own CSRF layer: actions whose `Origin` header does not match the
  request URL are rejected with 400 before application code runs. Behind a TLS-terminating proxy,
  the SSR server must therefore see the public origin (correct host and protocol); otherwise
  legitimate form submissions fail. This must be configured in the production setup (see
  [`OPEN-QUESTIONS.md`](../OPEN-QUESTIONS.md)).

## Sources

- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: dynamic rendering as a workaround](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)
- React Router docs, read from the official repository `remix-run/react-router` (commit
  `b830e2e`, 2026-11-11), because reactrouter.com is blocked in the development environment:
  `docs/how-to/headers.md`, `docs/how-to/status.md`, `docs/how-to/security.md`, and
  `packages/react-router/CHANGELOG.md` (v8.0.0: minimum Node 22.22.0 and React 19.2.7, ESM only).
- React Router source: `packages/react-router/lib/actions.ts` (`throwIfPotentialCSRFAttack`);
  introduced by PR #14708 according to the changelog.
- npm registry, queried on 2026-11-12: `react-router` 8.5.1 requires Node >= 22.22.0;
  `@react-router/dev` 8.5.1 accepts Vite ^7 or ^8 and TypeScript ^5, ^6 or ^7.
