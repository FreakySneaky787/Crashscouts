# CLAUDE.md – Arbeitsregeln für Claude Code in diesem Repository

Diese Regeln gelten für jede Sitzung. Sie fassen die verbindliche Arbeitsweise aus [`docs/MASTER-PROMPT.md`](docs/MASTER-PROMPT.md) (Abschnitt 10) und die Entscheidungen aus der Planungsphase zusammen.

## Projekt in einem Satz

Eine Open-Source-Plattform (AGPL-3.0), auf der Entwickler freiwillige Tester finden und Tester neue Software entdecken. Kampagnen, Testaufgaben und strukturiertes Feedback werden organisiert. Arbeitsname: **„TestHub"**, ein **Platzhalter**. Name, Logo, Domain und Branding legt allein der Projektverantwortliche fest; der Name wird nie im Code verstreut (zentral in `brand.ts` bzw. in den Settings).

## Wichtigste Regel

**Ist eine relevante Anforderung, ein Detail oder eine Entscheidung unklar: zuerst fragen, dann umsetzen.** Nicht raten, nicht stillschweigend entscheiden. Fragen werden gebündelt und mit ihren Auswirkungen erklärt.
Das gilt besonders für Produktfunktionen, UI/UX, Design, Berechtigungen, Datenmodell, Datenschutz, Sicherheit, API, Integrationen, Architektur, Technologien, Umfang und Naming.
Offene Punkte stehen in [`docs/OPEN-QUESTIONS.md`](docs/OPEN-QUESTIONS.md).

## Vor jeder Arbeit lesen

1. [`docs/STATUS.md`](docs/STATUS.md): tatsächlicher Stand
2. [`docs/MVP-PLAN.md`](docs/MVP-PLAN.md): Phasen, Arbeitspakete, Sicherheits-Gate
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) und [`docs/adr/`](docs/adr/): Architektur und Begründungen
4. [`docs/SECURITY.md`](docs/SECURITY.md): Sicherheitskonzept

## Arbeitsweise

- In **Arbeitspaketen** arbeiten. Vor Beginn vorstellen: Ziel, Anforderungen, Komponenten, Umsetzung, Abhängigkeiten, Akzeptanzkriterien, Tests, Definition of Done.
- **Rückfragen nur bei echter Tragweite** (Wunsch des Projektverantwortlichen, 2026-11-12): Design- und Produktfragen sowie Entscheidungen mit wesentlicher Wirkung auf Kosten, Sicherheit, Datenmodell oder Erweiterbarkeit. **Nicht** nachfragen bei Routineschritten wie dem Push eines freigegebenen Arbeitspakets, nachdem alle Prüfungen grün sind; das Ergebnis danach berichten.
- Keine grossen, unkontrollierten Codemengen.
- **Kritisch prüfen statt automatisch zustimmen.** Verbesserungen als Vorschlag einbringen; wichtige Änderungen brauchen Zustimmung.
- **Versionen und Fakten nie erfinden.** Zuerst offizielle Quellen prüfen und die Quelle nennen.
- Mit dem Projektverantwortlichen auf **Deutsch** kommunizieren. Die UI-Texte sind englisch und stehen in i18n-Dateien.

## Tests

- **Nie behaupten, dass ein Test bestanden hat, ohne ihn ausgeführt zu haben.** Ergebnisse mit echter Ausgabe berichten.
- Zu jeder Berechtigung gehören Negativtests („ein Fremder sieht nichts", private Ressourcen liefern 404).
- Integrationstests laufen gegen echtes PostgreSQL 18, nicht gegen SQLite.

## Sicherheit (nicht verhandelbar)

- **Keine Secrets, Tokens, Passwörter oder persönlichen Daten in Dateien, Commits, Logs oder Testdaten.** `.env*` ist ignoriert; Vorlagen kommen als `.env.example`.
- Vor **jedem** Commit gitleaks ausführen. Ab AP 0.6 geschieht das automatisch per pre-commit-Hook. Bei einem Fund: abbrechen und melden.
- Das Repo ist privat und läuft auf GitHub Free, also ohne Push Protection und ohne Branch-Schutz. Deshalb vor jedem Push den Diff prüfen.
- Öffentliche Kampagnen bleiben gesperrt (`PUBLIC_CAMPAIGNS_ENABLED=false`), bis das Sicherheits-Gate aus Phase 3B erfüllt ist. Das Flag schaltet nur der Projektverantwortliche um.
- Django-Admin ist nie öffentlich geroutet.
- Kein `--dangerously-skip-permissions`; Claude läuft im Dev-Container als Nicht-root-Nutzer.
- Werkzeuge und Images nur aus offiziellen Quellen; Versionen per Lockfile oder Digest fixieren.

## Git

- Commits gehen direkt auf `main` (so entschieden). Kleine, nachvollziehbare Commits pro Arbeitspaket.
- **Commit-Autor und Committer sind ausschliesslich `FreakySneaky787 <aaron.veider11@gmail.com>`** (Entscheidung des Projektverantwortlichen). Vor dem ersten Commit in jedem neuen Clone setzen: `git config user.name` und `git config user.email`.
- **Keine** Zeilen `Co-Authored-By: Claude` oder `Claude-Session:` in Commit-Nachrichten.
- Regelmässig pushen: Ein Codespace oder Cloud-Container ist **kein Backup**.
- `docs/STATUS.md` und betroffene Dokumente im **selben** Commit aktualisieren. Die Doku muss der Implementierung entsprechen.
- Keine Force-Pushes und keine Änderungen an GitHub-Einstellungen ohne ausdrückliche Zustimmung.

## Ausdrücklich nicht tun

- Keinen endgültigen Namen, kein Logo, kein Design und keine Domain festlegen.
- Keine Phase überspringen und keine Funktionen ausserhalb des freigegebenen Umfangs bauen.
- Keine fremde Software ausführen und keine ausführbaren Dateien hosten (Produktgrenze).
