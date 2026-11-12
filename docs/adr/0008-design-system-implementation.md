# 0008 – Design system implementation: CSS tokens, CSS Modules, self-hosted assets

- Status: Accepted
- Date: 2026-11-12

## Context

[ADR 0007](0007-visual-direction-developer-workbench.md) chose concept A as the visual direction.
The production frontend has to implement it under constraints that already exist:

- a nonce-based CSP in the production build (`style-src 'self'`, `font-src 'self'`) – inline style
  attributes and `data:` fonts are blocked;
- server-side rendering, and pages that must work without JavaScript;
- privacy: no requests to third-party services (fonts, icons, CDNs);
- WCAG 2.2 AA in light and dark mode;
- no final brand.

## Decision

1. **Design tokens as CSS custom properties** in `app/styles/tokens.css`; light on `:root`, dark
   via `prefers-color-scheme` (guarded by `:not([data-theme="light"])`) and `[data-theme="dark"]`.
2. **CSS Modules** per component (built into Vite); no CSS-in-JS runtime, no utility framework.
3. **Own small component set** in `app/components/ui/` instead of a third-party component library.
4. **Phosphor Icons** via `@phosphor-icons/react` 2.1.10 (MIT), imported from the `dist/ssr` entry
   (no React context needed during SSR), re-exported from one file (`icons.ts`).
5. **Self-hosted fonts** via Fontsource: `@fontsource/source-sans-3` 5.3.1 and
   `@fontsource/jetbrains-mono` 5.3.0 (both SIL OFL 1.1). Vite's `assetsInlineLimit` excludes font
   files so they are served as files, not `data:` URIs.
6. **Theme preference in a cookie** (`theme`), rendered by the server into `<html data-theme>`;
   switching via a form POST to `/theme` (works without JavaScript, enhanced with a fetcher).
7. **ESLint forbids the JSX `style` attribute**, because the CSP would block it in production.
8. **Accessibility checks** with `@axe-core/playwright` 4.14.0 (MPL-2.0, dev dependency of the
   E2E suite only).

## Alternatives

- **Tailwind CSS:** fast to write, but encourages the generic look the owner explicitly rejected
  and puts design decisions into class strings instead of tokens. Not chosen.
- **shadcn/ui, Radix Themes, MUI, Chakra:** strong defaults that would have to be fought against
  to match concept A; MUI/Chakra use runtime CSS-in-JS that conflicts with the CSP. Not chosen.
  Headless primitives (e.g. for a future dialog or menu) can still be added per component when
  native HTML is not enough – each as a separate decision.
- **Theme via `localStorage` and an inline script:** causes either a flash or an inline script that
  needs the CSP nonce; does not work without JavaScript. Not chosen.
- **Google Fonts:** request to a third party on every page view (privacy). Not chosen.

## Consequences

- No inline styles anywhere; dynamic visual values (identity hues, progress) use classes or native
  elements (`<progress>`).
- The `theme` cookie is a functional preference cookie, not tracking; it must be listed in the
  privacy policy before the beta.
- Components and rules are documented in [`DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md) and shown on
  `/design-system`.
- AGPL compatibility: MIT, OFL-1.1 (fonts, not linked code) and MPL-2.0 (test-only) are compatible.

## Sources

- Licences and versions from the package metadata in `frontend/node_modules` and
  `e2e/node_modules` (`package.json` fields `version` and `license`), pinned in the lockfiles.
- Phosphor React SSR entry: https://github.com/phosphor-icons/react#readme
- Fontsource: https://fontsource.org/docs/getting-started/install
- Vite `build.assetsInlineLimit`: https://vite.dev/config/build-options#build-assetsinlinelimit
- CSP `style-src`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src
