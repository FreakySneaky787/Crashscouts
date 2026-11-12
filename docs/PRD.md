# Produktanforderungen (PRD) – Kern-MVP

> Stand: 2026-11-12 · Status: **freigegeben** (Planungsphase) · Arbeitsname: „TestHub" (Platzhalter, nicht final)
>
> Grundlage: [`MASTER-PROMPT.md`](MASTER-PROMPT.md) plus die in der Planungssitzung getroffenen Entscheidungen.
> Markierung **⚑** = Vorschlag, mit dem Gesamtplan freigegeben; Details werden vor der jeweiligen Phase nochmals bestätigt.

## 1. Problem und Ziel

Open-Source- und unabhängige Entwickler finden schwer externe Tester. Gleichzeitig gibt es Menschen, die freiwillig neue Software ausprobieren und Feedback geben möchten.
Die Plattform bringt beide Gruppen zusammen und organisiert **menschliche** Softwaretests: Kampagnen, Aufgaben, strukturiertes Feedback.

Leitgedanke: *Software gemeinsam testen. Gemeinsam besser machen.*

## 2. Zielgruppen

| Rolle | Ziel auf der Plattform |
|---|---|
| Entwickler / Maintainer | Projekt präsentieren, Tester finden, Kampagnen durchführen, Feedback verwalten |
| Tester | Software entdecken, freiwillig teilnehmen, Fehler und Verbesserungen melden |
| Moderation / Admin | Missbrauch verhindern, Meldungen bearbeiten |

Ein Konto kann gleichzeitig Entwickler und Tester sein.

## 3. Verbindliche Rahmenentscheidungen

- Open-Source-first; kommerzielle und Closed-Source-Projekte sind erlaubt, aber klar gekennzeichnet (automatisch aus der SPDX-Lizenz).
- Öffentliche und private Kampagnen.
- Testmethoden: frei, strukturiert und kombiniert.
- Eine zentrale Plattform: keine Föderation und kein Self-Hosting im MVP.
- Teilnahme freiwillig und kostenlos; kein Verkauf von Nutzerdaten.
- Die Plattform ist Open Source unter AGPL-3.0 (siehe [ADR 0006](adr/0006-lizenz-agpl-3.0.md)).
- Keine Hosting-Funktion für ausführbare Dateien, keine automatische Ausführung fremder Software. Downloads laufen ausschliesslich über externe, offizielle Projektquellen.

## 4. In der Planungssitzung getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| MVP-Umfang | **Kern-MVP:** Konten, Projekte, Kampagnen, Testaufgaben, Feedback, einfache Discover-Suche, Meldefunktion und Moderations-Grundlagen. Feed, Following, Diskussionen und Empfehlungen folgen nach der Closed Beta. |
| Auffindbarkeit | Öffentliche Seiten werden serverseitig gerendert (SEO, Link-Vorschauen). |
| Feedback-Sichtbarkeit | Feedback ist **standardmässig privat** (meldende Person und Maintainer). Maintainer können einzelne Meldungen veröffentlichen. |
| Anmeldung | E-Mail und Passwort sowie GitHub-Login. 2FA (TOTP, Passkeys) ist optional. ⚑ Für Owner öffentlicher Kampagnen und für Moderatoren ist 2FA Pflicht. |
| Download-Schutz | Mehrstufig: nur HTTPS-Links, Warnseite, kontrollierte Freigabe öffentlicher Kampagnen, optionaler Nachweis der Repository-Inhaberschaft. |
| Sprache | Die Oberfläche ist auf Englisch; die i18n-Struktur ist von Anfang an vorhanden. |
| Mindestalter | 16 Jahre, per Selbstbestätigung bei der Registrierung. |
| Hosting | Schweiz oder EU; der Anbieter wird vor der Closed Beta gewählt. |
| Betreiber | Privatperson (rechtliche Folgen siehe [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)). |

## 5. Funktionale Anforderungen (Kern-MVP)

### 5.1 Konten und Profile

- Registrierung mit Bestätigung des Mindestalters, E-Mail-Verifizierung, Login und Logout, Passwort-Reset.
- Login mit GitHub. Das Datenmodell trennt Konto und Login-Identität, damit später weitere Anbieter wie Codeberg oder GitLab möglich sind.
- Optionale 2FA (TOTP, Passkeys, Recovery-Codes).
- Profil mit Benutzername, Profilbild, Biografie, Interessen, bevorzugten Betriebssystemen und technischen Kenntnissen.
- Datenschutz-Einstellungen: was öffentlich sichtbar ist.
- ⚑ Konto löschen (Feedback wird anonymisiert, nicht gelöscht) und Datenexport (JSON).
- *Nach der Beta:* Follower und öffentliche Aktivitäten.

### 5.2 Projekte

- Projekt anlegen und bearbeiten mit Name, Beschreibung, Logo, Screenshots, Kategorie, Betriebssystemen, Programmiersprachen, Lizenz (SPDX), Repository-Link, Status (Development, Alpha, Beta, Stable, Archived) und Maintainern.
- Rollen Owner und Maintainer.
- Optionaler Nachweis der Repository-Inhaberschaft, angezeigt als Abzeichen „verifiziert".
- Öffentliche, serverseitig gerenderte Projektseite.
- *Nach der Beta:* Releases als eigenes Objekt, Diskussionen.

### 5.3 Testkampagnen

- Felder: Titel, Beschreibung, Projekt, Softwareversion, Changelog, Testzeitraum, gewünschte Testeranzahl, Zielbetriebssysteme, Hardwareanforderungen, Voraussetzungen, Testmethode, Testaufgaben, Download-Links.
- Status: Draft, Open, Full, In Progress, Completed, Cancelled.
- Sichtbarkeit öffentlich oder privat. Private Kampagnen sind nur für Eingeladene sichtbar und erscheinen nirgends öffentlich.
- Teilnahme direkt, nach Freigabe oder per Einladung.
- Download-Links nur als `https://`, mit einer Warnseite vor dem Verlassen der Plattform.
- **Öffentliche Kampagnen werden erst sichtbar, wenn das Sicherheits-Gate erfüllt ist** (siehe [`MVP-PLAN.md`](MVP-PLAN.md), Phase 3B), und nur nach Freigabe in der Prüfqueue. ⚑ Ändern sich die Links einer bereits freigegebenen Kampagne, wird sie erneut geprüft.

### 5.4 Testaufgaben

- Maintainer definieren geordnete Aufgaben.
- Status pro Teilnehmer: Not Started, In Progress, Completed, Blocked.

### 5.5 Feedback

- Typen: Bug Report, UX Feedback, Feature Suggestion, Compatibility Report, General Feedback.
- Bug Reports enthalten Titel, Beschreibung, Reproduktionsschritte, erwartetes und tatsächliches Verhalten, Betriebssystem, Softwareversion, Screenshots und Logs.
- Status: New, Reviewed, Confirmed, In Progress, Fixed, Verified, Duplicate, Cannot Reproduce, Rejected.
- Anhänge nur als PNG, JPEG, WebP, TXT, LOG oder JSON.
- Standardmässig privat; Maintainer veröffentlichen einzeln.

### 5.6 Discover

- Suche und Filter nach Betriebssystem, Kategorie, Programmiersprache, Softwaretyp, Lizenz, Entwicklungsstatus und aktiven Kampagnen.
- Kleine Projekte dürfen nicht systematisch von populären verdrängt werden. Die Standard-Sortierung ist deshalb neu oder aktiv, nicht Popularität.

### 5.7 Meldungen und Moderation (Grundlagen)

- Projekte, Kampagnen und einzelne Download-Links melden.
- Admins können Kampagnen und Projekte sofort sperren (begründet, protokolliert, reversibel).
- Prüfqueue für öffentliche Kampagnen.
- Moderationsablauf mit Status und Audit-Log.
- Moderatoren erhalten **keinen** pauschalen Zugriff auf private Inhalte; nur zweckgebunden und protokolliert.

### 5.8 Benachrichtigungen (minimal)

- In der App und per E-Mail, nur für wesentliche Ereignisse: Einladung, Teilnahme freigegeben oder abgelehnt, Statusänderung am eigenen Feedback, Ergebnis einer Moderationsentscheidung.

## 6. Nicht-funktionale Anforderungen

- **Sicherheit und Datenschutz:** siehe [`SECURITY.md`](SECURITY.md); Schweizer DSG und voraussichtlich DSGVO.
- **Barrierefreiheit:** Ziel WCAG 2.2 AA.
- **Responsiv**, mit Dark Mode und Light Mode. Die visuelle Richtung ist **noch nicht entschieden** (offene Frage E).
- **i18n:** Alle Texte stehen von Anfang an in Übersetzungsdateien.
- **Austauschbarer Name:** Name und Branding sind zentral konfiguriert und nicht im Code verstreut.

## 7. Ausdrücklich nicht im Umfang

Die Plattform ersetzt weder GitHub, GitLab noch Codeberg. Sie ist kein CI/CD-System, kein Download-Portal, keine bezahlte Crowdtesting-Agentur und kein allgemeines Entwicklerforum. Sie führt keine fremde Software aus.

Im Kern-MVP fehlen ausserdem: Home-Feed, Following, Kommentare und Diskussionen, Projekt-Updates, Reputation und personalisierte Empfehlungen (siehe [`ROADMAP.md`](ROADMAP.md)).
