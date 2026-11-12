# Design System

The design system implements the visual direction **Developer Workbench** (concept A,
[ADR 0007](adr/0007-visual-direction-developer-workbench.md)). Technical decisions are recorded in
[ADR 0008](adr/0008-design-system-implementation.md). The living reference is the page
`/design-system` (not indexed, fictional data).

The name "TestHub", the placeholder favicon and the "T" mark in the sidebar are **not** a brand.
The final name, logo and branding are open and decided by the project owner alone.

## 1. Principles

These follow from the design research (see the design exploration in [`STATUS.md`](STATUS.md)):

1. **Work tool, not marketing page.** Dense but calm panels, tables and lists; no hero sections,
   no decorative gradients, no glassmorphism, no oversized rounded cards.
2. **One accent colour.** Teal is reserved for primary actions, the active state and links.
   Everything else is graphite neutrals.
3. **Status is never colour alone.** Every status shows an icon (where defined) and a text label.
4. **Clear hierarchy with few levels.** Fixed type scale (section 3); panel titles are larger than
   body text; three text colours (primary, secondary, muted).
5. **Works without JavaScript.** Navigation, tabs, the theme switch and the mobile menu are links,
   forms or `<details>`; JavaScript only improves them.
6. **Accessible by default.** WCAG 2.2 AA in both themes, verified by axe-core in the E2E suite.
7. **Honest copy.** Plain sentences, no exclamation marks, no emojis as icons.

### Ban list (generic "AI look")

Not used: purple-to-blue gradients, glow and glass effects, emoji icons, "✨" accents, Inter/Roboto/
Geist/DM Sans as default fonts, centred hero layouts for app pages, fake metrics, stock
illustrations, letter-spaced all-caps labels.

## 2. Colour tokens

Defined in [`frontend/app/styles/tokens.css`](../frontend/app/styles/tokens.css). Every token is
first defined on `:root` (light). Dark values are redefined under
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and again under
`:root[data-theme="dark"]`, so the system setting and an explicit choice both work.

| Group | Tokens | Use |
|---|---|---|
| Neutrals | `--color-bg`, `--color-surface`, `--color-surface-sunken`, `--color-line`, `--color-line-strong` | page, panels, inputs, borders |
| Text | `--color-fg`, `--color-fg-secondary`, `--color-fg-muted` | primary, secondary, meta text |
| Navigation | `--color-nav`, `--color-nav-active-bg` | sidebar |
| Accent | `--color-accent`, `--color-accent-fg`, `--color-accent-soft`, `--color-accent-text`, `--color-focus` | primary action, active state, links, focus ring |
| Status | `--color-ok/-warn/-danger/-info/-neutral` and `…-soft` | status pills, alerts, empty-state errors |
| Identity | `--hue-0` … `--hue-7`, `--identity-*` | avatars and project icons (hue from the ID, never from the name) |

**Rule:** components use tokens only, never literal colours.

## 3. Typography

- **Source Sans 3** (400, 600, 700) for the UI; **JetBrains Mono** (400, 500) for versions, IDs,
  environments and licences (`<code>`).
- Both are **self-hosted** via Fontsource (SIL OFL 1.1). No request goes to a third-party font
  service.

| Token | Size | Use |
|---|---|---|
| `--text-page` | 28px bold | page title (one `h1` per page) |
| `--text-section` | 20px bold | section headings |
| `--text-panel` | 16px bold | panel titles |
| `--text-figure` | 26px bold, tabular | key figures |
| `--text-body` | 14.5px | body text |
| `--text-sec` | 13.5px | secondary text |
| `--text-meta` | 12.5px | meta information (time, counts) |

Labels are sentence case, not letter-spaced capitals. Numbers in figures and tables use
`.tabular` (tabular figures).

## 4. Layout

- **App shell** ([`components/layout/AppShell.tsx`](../frontend/app/components/layout/AppShell.tsx)):
  sidebar (14rem) with main and secondary navigation, sticky top bar with theme switch and account,
  content up to 80rem wide. Skip link to `<main id="main">`.
- **Below 56rem** the sidebar is replaced by a `<details>` menu in the top bar (works without
  JavaScript).
- Spacing on a 4px grid (`--space-1` … `--space-12`); controls 32px high; interactive targets at
  least 24px (WCAG 2.5.8).

## 5. Components

All under [`frontend/app/components/ui/`](../frontend/app/components/ui/), each with its own CSS
module.

| Component | Purpose | Notes |
|---|---|---|
| `Button`, `ButtonLink` | actions and link buttons | variants `primary` (one per area), `secondary`, `quiet`, `danger` (irreversible actions only); size `sm`; optional icon; `aria-pressed` for toggles |
| `StatusPill` | status | tone + icon + text; status maps in `statuses.ts` (campaign, feedback, task, project) |
| `Panel` | grouped content | title, optional aside, `flush` for lists |
| `PageHeader` | top of each page | breadcrumbs, title, subtitle, meta line, actions, leading avatar/icon |
| `TabNav` | sections of a page | **links** with `aria-current="page"`, bookmarkable |
| `KeyFigures`, `Progress` | figures and progress | native `<progress>` with label |
| `Avatar`, `ProjectIcon` | identity | initials on a hue derived from the ID; `Avatar` shows an uploaded image when `src` is set (decorative, the name is always next to it) |
| `Chips`, `FactList`, `RowList` | data display | list semantics (`ul`/`dl`) |
| `TextField`, `TextAreaField`, `SelectField`, `ChoiceGroup`, `FormNote` | forms | visible labels, hints and errors via `aria-describedby`, `aria-invalid` |
| `CheckboxGroup` | multiple choice from a fixed list | fieldset with legend, hint and error; e.g. platforms |
| `CheckboxField` | single confirmation | label next to the box; error via `aria-describedby` |
| `QrCode` | QR code (e.g. authenticator setup) | server-rendered SVG, dark on light in both themes, `role="img"` with a label |
| `Notice` | inline message | tones `ok`, `info` (role `status`), `danger` (role `alert`); icon + text |
| `EmptyState` | empty and error states | kinds `first-use` (with action), `empty`, `error` |
| `ThemeToggle` | system / light / dark | see section 6 |

Icons come **only** from [`icons.ts`](../frontend/app/components/ui/icons.ts) (Phosphor Icons,
MIT, server-rendered SVG). Decorative icons are `aria-hidden`; icon-only buttons need an
accessible name.

## 6. Light and dark mode

- Preference in the cookie `theme` (`light` or `dark`; no cookie = system). Not a tracking cookie:
  it only stores the display preference, `SameSite=Lax`, `Secure` on HTTPS, one year.
- The server renders `<html data-theme="…">` from the cookie, so there is **no flash** of the wrong
  theme and no inline script is needed. Public pages already send `Vary: Cookie`, so a shared
  cache keeps the light and dark variants apart.
- The switch is a form posting to `/theme`. Without JavaScript the action redirects back to the
  current page (`safeRedirectPath`); with JavaScript it runs as a fetcher and the theme changes
  optimistically. Invalid values return 400; `GET /theme` redirects to `/`.

## 7. Rules

1. **No inline styles** (`style` attribute): the CSP (`style-src 'self'`) blocks them. ESLint
   enforces this.
2. **No literal colours** in components; tokens only.
3. **Icons only from `icons.ts`**; no emojis as icons.
4. **Status = icon + text**, never colour alone.
5. **Tabs and filters are links** (URL state), not client-only state.
6. **Every list view has an empty state** of the right kind.
7. **Fonts and assets are self-hosted**; fonts are never inlined as `data:` URIs (CSP
   `font-src 'self'`, see `vite.config.ts`).
8. **UI texts live in i18n files.** Exception: the developer reference `/design-system`.
9. New components get an entry on `/design-system` and in this document.

## 8. Verification

- E2E (`e2e/tests/design-system.spec.ts`): axe-core WCAG 2.2 A/AA on `/`, `/design-system` and
  `/login` in light and dark at 1280px and 390px; no horizontal overflow; no console errors;
  server-rendered theme without inline styles; theme switch with and without JavaScript; `/theme`
  input validation; self-hosted fonts; mobile menu without JavaScript.
- Vitest: theme cookie parsing and serialisation, identity hue and initials.
