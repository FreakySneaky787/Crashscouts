# Design prototypes (open question E)

> **Decision (2026-11-12): concept A – Developer Workbench** ([ADR 0007](../../docs/adr/0007-visual-direction-developer-workbench.md)).
> B and C stay in the prototype for reference only.

Clickable prototype comparing three visual directions over **the same fictional data and flows**.
It is a decision aid only: it does not replace production components and is not part of the
application build.

| Concept | Idea | Type | Colour |
|---|---|---|---|
| A – Developer Workbench | Dense lists, three panes, dimmed sidebar | Source Sans 3 + JetBrains Mono | Graphite, one teal accent |
| B – Open-Source Community | Reading column with rails, flat discussions, people round / projects square | Atkinson Hyperlegible Next | Cool off-white / green-tinted charcoal, forest green |
| C – Independent Software Community | Shelves of tiles with screenshots or terminal output, large type, spec strips | Hanken Grotesk + IBM Plex Mono | Ink and white, cobalt |

Pages: Home, Discover, project page, campaign page, tester profile (plus Testing and Your
projects). Simulated: navigation, tabs (arrow keys), follow, join/request, search, filters,
light/dark/system theme (in the product UI of every concept), concept switch, concept notes.
Concept A additionally shows in-app notifications and the feedback report dialog (validation,
private by default, listed under "Your reports"). Private campaigns behave like missing
pages (404 rule).

## Files

- `src/styles.css` – design tokens (per concept × light/dark) and components
- `src/data.js` – shared fictional sample data
- `src/app.js` – rendering, routing (`#<concept>-<page>[-<id>]`) and interactions
- `src/icons.svg.html` – generated sprite of Phosphor Icons 2.1.1 (MIT)
- `build.py` – builds `dist/index.html` (standalone) and `dist/prototype.html` (artifact body)

```bash
python3 design/prototypes/build.py
```

Open `design/prototypes/dist/index.html` in a browser.

## Third-party material

- Icons: [Phosphor Icons](https://phosphoricons.com/) 2.1.1, MIT License.
- Fonts (loaded from Google Fonts in the prototype only; production would self-host them):
  Source Sans 3, Atkinson Hyperlegible Next, Hanken Grotesk, JetBrains Mono, IBM Plex Mono –
  all SIL Open Font License 1.1.

## Verification (2026-11-12)

60 checks (3 concepts × 5 pages × light/dark × desktop 1280 px / phone 390 px) in Chromium with
axe-core 4.14 (WCAG 2.0/2.1/2.2 A and AA rules, including contrast): **0 violations**, no
horizontal page overflow, no JavaScript errors. Interaction smoke test: search, filter, request to
join, tabs incl. arrow keys, theme and concept switch, private campaign not exposed.
