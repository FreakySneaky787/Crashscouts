"""Builds the clickable design prototype from src/ into dist/.

dist/prototype.html  – page body for publishing as a claude.ai artifact (no <!doctype>/<html>/<head>,
                       the artifact host adds the document skeleton).
dist/index.html      – the same page as a standalone HTML document for local viewing.

Usage: python3 design/prototypes/build.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

FONTS = (
    "https://fonts.googleapis.com/css2?"
    "family=Atkinson+Hyperlegible+Next:wght@400;700"
    "&family=Hanken+Grotesk:wght@400;500;600;700;800"
    "&family=IBM+Plex+Mono:wght@400;500"
    "&family=JetBrains+Mono:wght@400;500"
    "&family=Source+Sans+3:wght@400;600;700"
    "&display=swap"
)


def build() -> None:
    css = (SRC / "styles.css").read_text(encoding="utf-8")
    icons = (SRC / "icons.svg.html").read_text(encoding="utf-8")
    data = (SRC / "data.js").read_text(encoding="utf-8")
    app = (SRC / "app.js").read_text(encoding="utf-8")

    body = f"""<title>TestHub Design Prototypes</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
{css}
</style>
{icons}
<a class="skip" href="#main">Skip to content</a>
<div id="proto" class="proto" role="region" aria-label="Prototype controls"></div>
<div id="notes" class="notes" role="region" aria-label="Concept notes" hidden></div>
<div id="app"></div>
<div id="toast" class="toast" role="status" hidden></div>
<div id="live" class="visually-hidden" aria-live="polite"></div>
<script>
{data}
</script>
<script>
{app}
</script>
"""
    DIST.mkdir(exist_ok=True)
    (DIST / "prototype.html").write_text(body, encoding="utf-8")
    standalone = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        "</head>\n<body>\n" + body + "</body>\n</html>\n"
    )
    (DIST / "index.html").write_text(standalone, encoding="utf-8")
    print(f"built {DIST / 'prototype.html'} ({len(body):,} bytes) and index.html")


if __name__ == "__main__":
    build()
