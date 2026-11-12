# 0007 – Visual direction: Developer Workbench (concept A)

- Status: Accepted (direction); the design system is derived from it in a separate step
- Date: 2026-11-12

## Context

Open question E required a visual direction before phase 1. Three clickable directions were built
over the same data and flows (see [`design/prototypes/`](../../design/prototypes/README.md)), after
researching generic "AI design" patterns and Primer, Linear, Discourse and Mozilla Protocol.
Requirement of the project owner: the interface must not look like a generic AI-generated SaaS
page.

## Decision

The project owner chose **concept A – Developer Workbench**:

- Sidebar navigation (dimmed when inactive), sticky top bar, content area with panels, tables and
  detail columns; breadcrumbs on detail pages.
- Type: Source Sans 3 for the UI, JetBrains Mono for versions, IDs and environments.
- Colour: graphite neutrals with one teal accent; separate, deliberately designed light and dark
  palettes; semantic status colours always paired with an icon and a text label.
- Icons: Phosphor Icons (MIT), one family throughout.
- **Light/dark mode is part of the product UI** (system, light, dark), not only a prototype
  control.

The owner noted that the concept is not yet perfect; refinement happens while deriving the design
system.

## Consequences

- The design system (tokens, components, patterns) is built from concept A and replaces the
  unstyled UI from WP 0.4. Concepts B and C remain in the prototype for reference only.
- Fonts are self-hosted in production (privacy); the prototype loads them from Google Fonts.
- Recorded weakness of A to watch: it can feel like work software for occasional testers. The
  prototype therefore keeps the tester's core flow (report feedback) prominent and the copy plain.

## Sources

- Research and references: see the design exploration in [`STATUS.md`](../STATUS.md) and the
  prototype README.
