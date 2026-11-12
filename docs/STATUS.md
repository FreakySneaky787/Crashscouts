# Entwicklungsstand

> Diese Datei beschreibt den **tatsächlichen** Stand. Sie wird bei jedem abgeschlossenen Arbeitspaket aktualisiert.
> Als erledigt gilt nur, was nachweislich geprüft wurde.

**Letzte Aktualisierung:** 2026-11-12 · **Aktuelle Phase:** 0 – Foundation

## Arbeitspakete

| AP | Status | Nachweis |
|---|---|---|
| 0.1 Repo anbinden, Umgebung prüfen | ✅ erledigt | siehe unten |
| 0.2 Doku-Grundgerüst | ✅ erledigt | Doku entspricht dem freigegebenen Plan; gitleaks-Scan ohne Funde |
| 0.3 Backend-Skelett | ⏳ offen | – |
| 0.4 Frontend-Skelett und SSR-Auth-Durchstich | ⏳ offen | – |
| 0.5 Dev-Container und Setup-Skript | ⏳ offen | – |
| 0.6 CI und pre-commit | ⏳ offen | – |
| 0.7 Playwright-Grundgerüst | ⏳ offen | – |

## Ergebnisse AP 0.1 (2026-11-12)

- Repository `FreakySneaky787/testhub`: privat, Standard-Branch `main`, zu Beginn leer.
- **Claude-Cloud-Umgebung:** Ubuntu 24.04, 4 CPU, 15 GB RAM.
  - Vorinstalliert: Python 3.13.18, Node 22.23.4, pnpm 10.28.0, uv 0.11.32, Docker-CLI 29.9.2 mit Compose v5.6.1.
  - Die Zielversionen Python 3.14 und Node 24 kommen erst mit AP 0.3 bis 0.5.
- **Docker-Daemon:** startet in der Cloud-Umgebung (manueller Start von `dockerd`).
- **PostgreSQL:** Das offizielle Image `postgres:18` ergab PostgreSQL **18.6**; der Lese- und Schreibtest war erfolgreich, Port nur an `127.0.0.1` gebunden. Der Testcontainer wurde danach entfernt.
- **Hinweis:** Die Umgebung nutzt cgroup v1. Docker meldet, dass die Unterstützung spätestens im Mai 2029 entfällt; für die Entwicklung unkritisch.

## Ergebnisse AP 0.2 (2026-11-12)

- Die Doku unter `docs/` und die ADRs 0001–0006 sind angelegt, ebenso `CLAUDE.md`, `README.md`, `CONTRIBUTING.md` (Entwurf), `SECURITY.md` (vorläufig) und `LICENSE`.
- Der `LICENSE`-Text (AGPL-3.0) stammt aus GitHubs Lizenzvorlage (choosealicense.com) und ist inhaltlich gegen die SPDX-Lizenzliste geprüft. Einziger Unterschied: `https` statt `http` in drei FSF-URLs.
- gitleaks v8.30.1 wurde über den Go-Modul-Proxy mit Prüfsummenkontrolle gebaut; sein Scan des Repos fand nichts.

## Bekannte Einschränkungen

- GitHub Free bei privaten Repos: keine Push Protection und kein Branch-Schutz (siehe [`SECURITY.md`](SECURITY.md), Abschnitt 10).
- Noch kein Anwendungscode, keine CI und keine Tests.
