# 0035 – Brand and home page

- Status: Accepted
- Date: 2026-11-17

## Context

Before the launch (stage 0 of [LAUNCH-PLAN.md](../LAUNCH-PLAN.md)) the site had:

- no logo: a first letter in a dark square;
- a home page that said "Early development build" and "Nothing to show yet";
- no preview image for shared links;
- a filter panel on Discover that filled the first screen.

The owner found the site too plain for a launch. The "Developer Workbench" direction
([ADR 0007](0007-visual-direction-developer-workbench.md)) stays: a calm working tool. Logo and
branding are the owner's decisions alone (CLAUDE.md).

## Decision (owner's decisions 2026-11-17)

- **No redesign of the app**, only the launch appearance (WP 8.9).
- **Logo: the "broken C"**, chosen from six drafts on a comparison page.
  - Design "G1": both halves on one circle (r = 15, centre 24/24), the ends at ±40° flush, a gap
    on the left, a dot in the opening.
  - Graphite with the accent dot: `app/components/brand/Logo.tsx`. The ink follows the text colour,
    so it works in both themes.
  - The icon ("G3") is the mark in white on a teal square: `public/favicon.svg`, plus
    `apple-touch-icon.png` (full bleed), `icon-192.png` and `icon-512.png`.
  - The web app manifest is built from `config/brand.ts` (`/site.webmanifest`), so the name stays
    in one place.
- **Heading font: Bricolage Grotesque** (SIL OFL 1.1, Fontsource 5.3.0, self-hosted, Latin, 700
  and 800).
  - Used for page titles (`h1`), the brand name and the larger home-page sections.
  - Panel titles stay in Source Sans 3, which reads better at small sizes.
- **No second accent colour** (the owner chose against it). Teal remains the only accent.
- **Home page: "clear, but in style".**
  - Visitors see:
    - a headline;
    - one sentence on what Crashscouts is;
    - "I need testers" (sign-up) and "I want to test" (Discover, campaigns);
    - three numbered steps (the order is real: publish, join, feedback);
    - the newest open campaigns;
    - three reasons that are true of the platform: AGPL, no tracking, sorting by activity
      instead of popularity.
  - Signed-in people see a welcome, their next steps and the campaigns.
  - The same colours and fonts as the app, no full-width hero, no stock images.
- **Illustrations:** small line drawings made for Crashscouts (`Illustrations.tsx`), in the
  theme's colours, always decorative (`aria-hidden`).
- **Link previews:**
  - `public/og-image.png` (1200 × 630) is rendered from `frontend/scripts/og-image.html`;
  - `lib/social.ts` adds the Open Graph and Twitter card tags to the home page, Discover, public
    projects and indexable campaigns;
  - the image address uses the page's own host.
- **Discover:**
  - the search stays visible;
  - the other filters fold into a `<details>` "More filters", which works without JavaScript;
  - it starts open while one of those filters is set.
- **The "Design system" link** appears only in the development server. The page stays reachable
  and is not indexed.

## Alternatives

| Option | Why not chosen |
|---|---|
| A full redesign before the launch | Weeks of work; the launch depends on campaigns finding testers, not on looks |
| A separate landing page without the sidebar | Breaks with the app and the design system; more eye-catching but less honest about the product |
| A second accent colour (orange, amber, coral) | Owner's decision: not now. None reached 4.5:1 on white for small text |
| A designer | Costs money and time; the drafts were good enough to choose from |

## Consequences

- Other pages (legal pages, account pages) still have no preview image; they are rarely shared.
- After a change to the name or the headline, render the preview image again
  (`node scripts/og-image.mjs`, needs Playwright).
- A trademark search for the name and logo is still up to the owner (question K).
