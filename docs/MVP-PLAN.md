# MVP-Plan (Kern-MVP)

> Stand: 2026-11-12 · Status: **freigegeben**
>
> Vor Beginn wird jedes Arbeitspaket (AP) detailliert: Ziel, Anforderungen, betroffene Komponenten, Umsetzung, Abhängigkeiten, Akzeptanzkriterien, Tests und Definition of Done.
> Offene Produktfragen werden vorher geklärt ([`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)). Der aktuelle Fortschritt steht in [`STATUS.md`](STATUS.md).

## Abweichung von der ursprünglichen Phasenreihenfolge

Die Phasen aus dem Master-Prompt wurden mit Zustimmung umgeordnet:

- Feed, Following, Diskussionen und Empfehlungen kommen **nach** der Closed Beta.
- Die **Moderations-Grundlagen** kommen **vor** öffentliche Kampagnen (Sicherheits-Gate, Phase 3B).
- Grund: Externe Download-Links zu unbekannter Software sind der grösste Missbrauchsweg. Schutzmassnahmen dürfen nicht hinter den Funktionen herhinken, die sie absichern.

## Phase 0 – Foundation

| AP | Inhalt | Akzeptanzkriterium |
|---|---|---|
| 0.1 | Repo anbinden, Umgebung prüfen | Bericht: was läuft, welche Versionen |
| 0.2 | Doku-Grundgerüst, ADR 0001–0006, `CLAUDE.md`, `LICENSE`, Repo-Grundlagen | Doku entspricht dem Plan; gitleaks findet nichts |
| 0.3 | Backend-Skelett: Django 6.1, Custom-User, Settings-Aufteilung, Health-Endpunkt, OpenAPI, pytest | `pytest` grün gegen PostgreSQL 18 |
| 0.4 | Frontend-Skelett und **SSR-Auth-Durchstich** (siehe unten) | alle 6 SSR-Kriterien automatisiert grün |
| 0.5 | Dev-Container und Compose, Setup-Skript für die Claude-Cloud-Umgebung | Start in Codespaces und in der Cloud-Sitzung dokumentiert und verifiziert |
| 0.6 | CI: Lint, Typecheck, Tests, gitleaks, Audits, Schema-Check; Dependabot; pre-commit | CI grün |
| 0.7 | Playwright-Grundgerüst mit Smoke-Test | E2E-Smoke-Test in CI grün |

### AP 0.4 – SSR-Auth-Durchstich: Abnahmekriterien

Neben React Router SSR, TypeScript 6, i18n, `brand.ts` und Vitest gehören dazu ein minimaler allauth-Login (E-Mail und Passwort) und eine ⚑ **test-only-Probe-App** mit einem öffentlichen und einem privaten Probe-Objekt. Die Probe-App wird in der Produktion nicht installiert, damit das echte Datenmodell nicht vorzeitig festgelegt wird.

1. Eine öffentliche Seite wird serverseitig gerendert.
2. Ein angemeldeter Nutzer öffnet eine geschützte Seite.
3. Die Session bleibt über mehrere Navigationen und einen Reload erhalten; `Set-Cookie` und CSRF funktionieren bei Login, Logout und einer schreibenden Aktion.
4. Ein privates Objekt liefert Fremden und Anonymen **404**, sowohl über SSR als auch über die API.
5. Private SSR-Antworten tragen `Cache-Control: private, no-store` und `Vary: Cookie`; öffentliche anonyme Seiten setzen keine Session-Cookies.
6. `curl` ohne JavaScript erhält vollständiges HTML mit Titel und Open-Graph-Tags.

**Erst dann gilt die SSR-Architektur als validiert.** Schlägt etwas fehl, wird gestoppt und es werden Alternativen vorgelegt. Die Tests werden in Phase 2 und 3 auf die echten Modelle übertragen und bleiben als Regressionstests bestehen.

## Phase 1 – Accounts

- Registrierung (16+), E-Mail-Verifizierung, Login und Logout, Passwort-Reset.
- GitHub-Login.
- Optionale 2FA (TOTP, Passkeys, Recovery-Codes).
- Profil und Privatsphäre-Einstellungen.
- ⚑ Konto löschen und Daten exportieren.
- Grundlage für das Audit-Log.
- **Vorher zu klären:** visuelle Richtung (E) und E-Mail-Versand (F).

## Phase 2 – Projects

- Projekte anlegen und bearbeiten.
- Taxonomien, SPDX-Lizenz mit Kennzeichnung „Open Source" oder „Proprietär".
- Maintainer verwalten.
- Screenshots über eine sichere Upload-Pipeline.
- Repository-Verifizierung (B).
- Öffentliche SSR-Projektseite mit Meta-Tags und Open-Graph-Tags.

## Phase 3A – Campaigns (öffentliche Sichtbarkeit gesperrt)

- Private Kampagnen vollständig; öffentliche Kampagnen nur als Entwurf.
- Statusmaschine (C).
- Download-Links mit Warnseite.
- Einladungen.
- Teilnahme direkt oder nach Freigabe.
- Minimale Benachrichtigungen.
- Feature-Flag `PUBLIC_CAMPAIGNS_ENABLED=false`, serverseitig erzwungen und getestet.

## Phase 3B – Sicherheits-Gate (Pflicht vor jeder öffentlichen Kampagne)

Das Gate ist erst erfüllt, wenn **alle** Punkte implementiert und getestet sind. Erst danach wird das Flag umgeschaltet, und zwar nur durch den Projektverantwortlichen.

1. **Melden:** Projekte, Kampagnen und einzelne Download-Links (Grund, Freitext, Ratelimit). Auch Eingeladene in privaten Kampagnen können melden.
2. **Sperren durch Admin:** Kampagnen und Projekte sind sofort verborgen, und Links werden nicht mehr ausgeliefert, auch nicht an Teilnehmende. Die Sperre ist begründet, protokolliert und reversibel.
3. **Rate Limiting** pro Nutzer und IP für Login, Registrierung, Reset, Meldungen, Kampagnen-Erstellung, Einladungen und Uploads; getestet.
4. **Verifizierte E-Mail** ist Pflicht für das Erstellen von Kampagnen und für Meldungen.
5. **Kontrollierte Freigabe:** Jede neue öffentliche Kampagne läuft über eine Prüfqueue. ⚑ Änderungen an Download-Links einer freigegebenen Kampagne lösen eine erneute Prüfung aus.
6. **Moderationsablauf:** Queue mit den Status offen, in Prüfung, erledigt und abgewiesen; Aktionen ausblenden, sperren und verwarnen; Rückmeldung an die meldende Person; Audit-Log; Moderationsseiten in der App.
7. Wartezeit- und 2FA-Regel für Owner öffentlicher Kampagnen (A).
8. E2E-Test „Missbrauchsfall": einreichen, prüfen, freigeben, Link melden, sperren; danach ist der Link nicht mehr erreichbar.

## Phase 4 – Testing

- Testaufgaben für die Methoden frei, strukturiert und kombiniert.
- Fortschritt pro Teilnahme.
- Übersicht für Maintainer.

## Phase 5 – Feedback

- Fünf Typen mit typspezifischen Feldern.
- Sichere Anhänge.
- Statusworkflow.
- Standardmässig privat, einzeln veröffentlichbar.
- Maintainer-Inbox.

## Phase 6 – Discover

- PostgreSQL-Volltextsuche mit Filtern.
- Fairnessregel: Standard-Sortierung neu oder aktiv statt Popularität.

## Phase 7 – Moderation ausbauen und Sicherheitsreview

- Melden von Nutzern und veröffentlichtem Feedback.
- Kontosperren mit Fristen, Einsprüche.
- Mehrere Moderatoren mit zweckgebundenem, protokolliertem Zugriff.
- Statistiken.
- Sicherheitsreview nach OWASP ASVS Level 1.

## Phase 8 – Release (Closed Beta)

- Integrations-, Performance- und Barrierefreiheitsprüfung.
- Rechtstexte und juristische Prüfung.
- Hosting-Entscheidung und Produktions-Setup.
- Getestete Backup-Wiederherstellung.
- Repo öffentlich schalten.
- Closed Beta.

## Abnahmekriterien Kern-MVP

- Alle Kernabläufe sind als E2E-Tests in CI grün.
- Die Berechtigungsmatrix ist vollständig getestet, inklusive Negativfällen für private Kampagnen und privates Feedback.
- Keine offenen hohen oder kritischen Befunde aus Audits und dem ASVS-L1-Review.
- Die Backup-Wiederherstellung ist dokumentiert getestet.
- Rechtstexte sind vorhanden und geprüft.
- `STATUS.md` und die Doku entsprechen der Implementierung.
