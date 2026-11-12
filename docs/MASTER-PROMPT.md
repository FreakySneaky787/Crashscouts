# MASTER PROMPT – SOFTWARE TESTING COMMUNITY PLATFORM
## Initial Project Planning, Product Strategy, Cloud Development & Technical Architecture

> Archivierte Originalfassung des Master-Prompts, mit dem die Planungsphase am 2026-11-12 gestartet wurde.
> Abweichungen und Präzisierungen, die danach gemeinsam entschieden wurden, stehen in
> [`PRD.md`](PRD.md), [`MVP-PLAN.md`](MVP-PLAN.md) und den ADRs unter [`adr/`](adr/).
> Bei Widersprüchen gelten die neueren, ausdrücklich freigegebenen Entscheidungen.

**WICHTIG: Dieser Prompt startet die erste Planungsphase des gesamten Projekts. Du befindest dich zunächst im Plan Mode von Claude Code.**

Du sollst das vorhandene Projekt zunächst vollständig verstehen, untersuchen, hinterfragen und planen.

Du sollst noch keine Implementierung beginnen.

Du übernimmst die Rolle eines technischen Mitgründers, Softwarearchitekten, Product Managers, Senior Full-Stack Developers, Security Engineers und technischen Projektleiters.

Dein Ziel ist es, mich systematisch von einer Produktidee zu einer professionellen, funktionierenden Open-Source-Plattform zu führen.

---

# 1. PROJEKTIDENTITÄT

## 1.1 Vorläufiger Projektname

Der bisher verwendete Name lautet **TestHub**.

WICHTIG: TestHub ist ausschliesslich ein vorläufiger Variablenname und kein endgültiger Produktname.

Der endgültige Name wird zu einem späteren Zeitpunkt von mir selbst bestimmt.

Du darfst:
- TestHub als interne Projektbezeichnung verwenden.
- Den Platzhalternamen vorübergehend in technischen Dokumentationen benutzen.
- Die technische Architektur auf einen späteren Namenswechsel vorbereiten.

Du darfst NICHT:
- Den Namen als endgültige Marke behandeln.
- Eigenständig einen endgültigen Namen festlegen.
- Ein endgültiges Logo oder Corporate Design erstellen.
- Domains oder Social-Media-Auftritte unter diesem Namen festlegen.
- Den Namen ohne meine Zustimmung als endgültige Produktidentität verwenden.

Der Projektname soll später zentral austauschbar sein.

## 1.2 Produktvision

Das Projekt ist eine soziale Plattform für Softwareentwickler und freiwillige Softwaretester.

Die Plattform verbindet Menschen, die Software entwickeln, mit Menschen, die neue Software ausprobieren und bei deren Verbesserung helfen möchten.

Das grundlegende Problem:

Viele Open-Source-Entwickler und unabhängige Softwareentwickler haben Schwierigkeiten, genügend externe Tester zu finden.

Sie entwickeln Software, testen diese auf ihren eigenen Geräten und veröffentlichen neue Versionen. Dabei wissen sie häufig nicht, ob ihre Anwendung auch auf anderen Systemen, mit anderer Hardware oder unter anderen Nutzungsbedingungen funktioniert.

Gleichzeitig gibt es viele Menschen, die:
- Neue Software ausprobieren möchten.
- Beta-Versionen testen möchten.
- Fehler entdecken und melden.
- Entwicklern helfen möchten.
- Neue Open-Source-Projekte kennenlernen möchten.
- Teil einer technischen Community sein möchten.

Diese beiden Gruppen sollen zusammenfinden.

**Die zentrale Idee: Entwickler sollen Tester finden können, und Tester sollen interessante Software entdecken können.**

Die Plattform ist eine Kombination aus:
1. Sozialem Netzwerk.
2. Open-Source-Projektverzeichnis.
3. Beta-Testing-Plattform.
4. Feedback- und Bug-Reporting-System.
5. Community für Softwareentwicklung und Softwaretests.

Sie soll sich wie ein modernes soziales Netzwerk anfühlen und nicht wie eine klassische Unternehmensverwaltungssoftware.

## 1.3 Produktversprechen

Für Entwickler:
- Neue Tester finden.
- Software präsentieren.
- Beta-Versionen testen lassen.
- Feedback sammeln.
- Fehler erkennen.
- Eine Community aufbauen.

Für Tester:
- Neue Software entdecken.
- Freiwillig an Testkampagnen teilnehmen.
- Fehler melden.
- Verbesserungsvorschläge einreichen.
- Neue Technologien ausprobieren.
- Anerkennung für hilfreiche Beiträge erhalten.

Für die Community:
- Open-Source-Projekte sichtbarer machen.
- Zusammenarbeit fördern.
- Softwarequalität verbessern.
- Entwickler und Nutzer direkt miteinander verbinden.

Leitgedanke:

**Software gemeinsam testen. Gemeinsam besser machen.**

---

# 2. VERBINDLICHE PRODUKTENTSCHEIDUNGEN

Diese Entscheidungen wurden bereits getroffen. Ändere sie nicht eigenständig.

## 2.1 Open-Source-first

Open-Source-Projekte stehen im Mittelpunkt.

- Open-Source-Projekte sollen besonders sichtbar sein.
- Auch kleine Projekte sollen entdeckt werden können.
- Die Plattform selbst wird Open Source.
- Kommerzielle und Closed-Source-Projekte dürfen ebenfalls teilnehmen.
- Andere Projekte müssen klar gekennzeichnet sein.

## 2.2 Sichtbarkeit von Testkampagnen

Es gibt zwei Modi.

**Public Campaigns:**
- Öffentlich sichtbar.
- Im Discover-Bereich auffindbar.
- Im öffentlichen Feed darstellbar.
- Teilnahme direkt oder nach Freigabe.

**Private Campaigns:**
- Nicht öffentlich sichtbar.
- Nur für eingeladene Personen zugänglich.
- Nicht in Discover oder öffentlichen Feeds sichtbar.
- Private Inhalte, Dateien und Diskussionen geschützt.

## 2.3 Testmethoden

Die Plattform unterstützt:

**Free Testing:** Freies Ausprobieren der Software mit allgemeinem Feedback.

**Structured Testing:** Entwickler stellen konkrete Aufgaben bereit.

**Combined Testing:** Kombination beider Methoden.

## 2.4 Plattformstruktur

- Eine zentrale Community-Plattform.
- Keine Föderation im MVP.
- Self-Hosting nicht im MVP.
- Architektur soll spätere Erweiterungen ermöglichen.

## 2.5 Freiwilligkeit

Die Teilnahme ist freiwillig und kostenlos.

Keine verpflichtenden Mitgliedschaften, Abonnements oder Zahlungen.

Keine Monetarisierung durch den Verkauf persönlicher Nutzerdaten.

## 2.6 Lizenz

AGPL-3.0 ist die bevorzugte Lizenz.

Prüfe die Lizenzwahl später kritisch, bevor sie endgültig veröffentlicht wird.

---

# 3. FUNKTIONSUMFANG

Die folgende Beschreibung ist die bestehende Produktbasis.

Du sollst sie überprüfen, strukturieren und auf Vollständigkeit untersuchen.

Erfinde keine zusätzlichen Produktanforderungen, ohne mich vorher zu fragen.

## 3.1 Benutzerkonten und Profile

- Registrierung.
- E-Mail-Verifizierung.
- Login und Logout.
- Passwortzurücksetzung.
- Benutzername und Profilbild.
- Biografie.
- Interessen.
- Bevorzugte Betriebssysteme.
- Technische Kenntnisse.
- Datenschutzeinstellungen.
- Öffentliche Aktivitäten.
- Follower.

Ein Nutzer kann gleichzeitig Tester und Entwickler sein.

## 3.2 Home – Social Feed

- Neue Projekte.
- Neue Testkampagnen.
- Neue Releases.
- Projektupdates.
- Diskussionen.
- Community-Aktivitäten.
- Interessante Testergebnisse.
- Personalisierte Empfehlungen.
- Chronologische Ansicht.

Kleine Open-Source-Projekte dürfen nicht grundsätzlich von populären Projekten verdrängt werden.

## 3.3 Discover

Filtermöglichkeiten:

- Betriebssystem.
- Kategorie.
- Programmiersprache.
- Softwaretyp.
- Lizenz.
- Entwicklungsstatus.
- Aktive Testkampagnen.

Beispiele:

Linux, Windows, macOS, Android, Web, Desktop, CLI, Gaming und Developer Tools.

## 3.4 Projekte

Jedes Projekt besitzt eine eigene Projektseite.

Mögliche Informationen:

- Name.
- Beschreibung.
- Logo.
- Screenshots.
- Kategorie.
- Betriebssysteme.
- Programmiersprachen.
- Lizenz.
- Repository-Link.
- Releases.
- Projektstatus.
- Maintainer.
- Testkampagnen.
- Diskussionen.
- Feedback.

Statuswerte:

- Development.
- Alpha.
- Beta.
- Stable.
- Archived.

## 3.5 Testkampagnen

Entwickler können Kampagnen mit folgenden Informationen erstellen:

- Titel und Beschreibung.
- Zugehöriges Projekt.
- Softwareversion.
- Changelog.
- Testzeitraum.
- Gewünschte Testeranzahl.
- Zielbetriebssysteme.
- Hardwareanforderungen.
- Voraussetzungen.
- Testmethodik.
- Testaufgaben.
- Downloadlinks.

Statuswerte:

- Draft.
- Open.
- Full.
- In Progress.
- Completed.
- Cancelled.

Teilnahme:

- Direkte Teilnahme.
- Teilnahme nach Freigabe.
- Private Einladungen.

## 3.6 Testaufgaben

Entwickler können Aufgaben definieren.

Beispiele:
- Software installieren.
- Anwendung starten.
- Datei importieren.
- Bestimmte Funktion testen.
- Einstellungen ändern.
- Daten exportieren.
- Ergebnis dokumentieren.

Status:

- Not Started.
- In Progress.
- Completed.
- Blocked.

## 3.7 Feedback

Feedbacktypen:

- Bug Report.
- UX Feedback.
- Feature Suggestion.
- Compatibility Report.
- General Feedback.

Bug Reports können enthalten:

- Titel.
- Beschreibung.
- Reproduktionsschritte.
- Erwartetes Verhalten.
- Tatsächliches Verhalten.
- Betriebssystem.
- Softwareversion.
- Screenshots.
- Logs.

Feedbackstatus:

- New.
- Reviewed.
- Confirmed.
- In Progress.
- Fixed.
- Verified.
- Duplicate.
- Cannot Reproduce.
- Rejected.

Private Feedbackmeldungen bleiben standardmässig privat.

## 3.8 Community

- Kommentare.
- Antworten.
- Diskussionen.
- Following.
- Projektupdates.
- Benachrichtigungen.
- Community-Aktivitäten.

## 3.9 Reputation

Spätere mögliche Auszeichnungen:

- Helpful Tester.
- Reliable Tester.
- Compatibility Expert.
- Early Contributor.
- Community Helper.

Qualität ist wichtiger als reine Anzahl von Beiträgen.

## 3.10 Moderation

- Benutzer melden.
- Projekte melden.
- Kampagnen melden.
- Kommentare melden.
- Spam entfernen.
- Verwarnungen.
- Kontosperrungen.
- Moderationsprotokolle.

Private Inhalte dürfen nicht pauschal für alle Moderatoren zugänglich sein.

---

# 4. PRODUKTGRENZEN

Die Plattform soll zunächst NICHT:

- GitHub ersetzen.
- GitLab ersetzen.
- Codeberg ersetzen.
- Ein CI/CD-System sein.
- Fremde Software automatisiert ausführen.
- Ein Software-Download-Portal sein.
- Eine bezahlte Crowdtesting-Agentur sein.
- Ein allgemeines Entwicklerforum sein.

Der Schwerpunkt ist die Vermittlung und Organisation menschlicher Softwaretests.

---

# 5. CLOUD-ENTWICKLUNGSUMGEBUNG

**Diese Vorgabe ist verbindlich. Die Entwicklung soll primär in der Cloud stattfinden.**

Ich möchte das Projekt von verschiedenen Standorten und Geräten aus vollständig im Browser bearbeiten können.

Ich möchte nicht darauf angewiesen sein, meinen privaten Computer oder eine lokal installierte Entwicklungsumgebung zu verwenden.

## 5.1 Gewünschte Infrastruktur

Die vorgesehene Lösung:

- GitHub als zentrale Versionsverwaltung.
- GitHub Repository als dauerhafte Quelle des Projekts.
- GitHub Codespaces als Cloud-Entwicklungsumgebung.
- VS-Code-Weboberfläche im Browser.
- Claude Code direkt im Codespace.
- Docker für die Entwicklungsumgebung.
- PostgreSQL als Projektdatenbank.

Die Entwicklung erfolgt browserbasiert.

Keine lokale VS-Code-Installation ist vorausgesetzt.

## 5.2 Bestehendes Repository untersuchen

Untersuche zunächst:
- Welches Repository geöffnet ist.
- Welcher Git-Branch aktiv ist.
- Ob bereits Dateien existieren.
- Ob die Codespace-Umgebung korrekt eingerichtet ist.
- Welche Tools bereits installiert sind.
- Welche Python-, Node.js- und Git-Versionen vorhanden sind.
- Welche Ressourcen verfügbar sind.
- Ob Dev-Container-Konfigurationen existieren.

Erstelle keine neue Umgebung, wenn eine geeignete Umgebung bereits vorhanden ist.

## 5.3 Cloud-Persistenz

Die Projektdateien befinden sich im persistenten Repository-Verzeichnis des Codespaces.

Wichtige Regeln:

- Änderungen regelmässig mit Git versionieren.
- Änderungen auf GitHub pushen.
- Keine wichtigen Dateien ausserhalb des Projektverzeichnisses speichern.
- Keine Zugangsdaten in Git-Dateien speichern.
- GitHub Codespaces Secrets verwenden, wenn geheime Zugangsdaten notwendig sind.
- Den bestehenden Codespace möglichst geräteübergreifend weiterverwenden.
- Nicht für jedes Gerät einen neuen unabhängigen Entwicklungsstand anlegen.

Der GitHub-Remote ist die dauerhafte und massgebliche Quelle des Quellcodes.

Ein Codespace allein ist kein Backup. Nicht gepushte Änderungen dürfen niemals als dauerhaft gesichert betrachtet werden.

## 5.4 Entwicklungsumgebung

Der vorgeschlagene Technologie-Stack:

| Bereich | Technologie |
|---|---|
| Frontend | React |
| Sprache | TypeScript |
| Build | Vite |
| Backend | Python |
| Backend-Framework | Django |
| API | Django REST Framework |
| Datenbank | PostgreSQL |
| Cache | Redis, bei Bedarf |
| Background Jobs | Celery, bei Bedarf |
| Container | Docker |
| Deployment | Docker Compose |

Entwickle die Anwendung als modularen Monolithen.

Microservices sind für das MVP nicht vorgesehen.

Prüfe aktuelle stabile Versionen und offizielle Dokumentation zum Implementierungszeitpunkt.

## 5.5 Dev-Container

Eine reproduzierbare `.devcontainer/devcontainer.json` soll langfristig die Entwicklungsumgebung beschreiben.

Mögliche Inhalte:

- Entwicklungsimage.
- Python.
- Node.js.
- Git.
- Docker-Unterstützung.
- Notwendige Tools.
- Portkonfiguration.
- Setup-Skripte.

**In der aktuellen Planungsphase darfst du diese Datei nicht erstellen oder ändern.**

Untersuche zuerst die bestehende Umgebung und präsentiere eine konkrete Konfiguration als Vorschlag.

Ich muss sie freigeben, bevor sie implementiert wird.

## 5.6 Ports und Sicherheit

Während der Entwicklung können beispielsweise folgende Ports verwendet werden:

- Frontend: 5173.
- Backend: 8000.
- PostgreSQL: 5432.

Prüfe die tatsächliche Konfiguration.

Webserver-Ports dürfen zunächst nur privat über Codespaces erreichbar sein.

Die Datenbank darf nicht öffentlich exponiert werden.

## 5.7 Entwicklungsumgebung und Produktivbetrieb

Die Cloud-Entwicklungsumgebung ist nicht das spätere Produktivhosting.

Plane diese Systeme getrennt.

Die produktive Plattform soll später unabhängig vom Codespace betrieben werden können.

---

# 6. PROJEKTSTRUKTUR UND DOKUMENTATION

Die endgültige Struktur ist noch nicht festgelegt.

Eine mögliche Struktur:

```text
project/
├── .devcontainer/
├── .claude/
├── docs/
│   ├── MASTER-PROMPT.md
│   ├── PRD.md
│   ├── MVP-PLAN.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── DECISIONS.md
│   ├── OPEN-QUESTIONS.md
│   ├── ROADMAP.md
│   └── STATUS.md
├── frontend/
├── backend/
├── tests/
├── CLAUDE.md
├── README.md
├── CONTRIBUTING.md
└── docker-compose.yml
```

Dies ist nur ein Vorschlag.

Untersuche zuerst, ob eine andere Struktur besser geeignet ist.

Die Dokumentation soll langfristig folgende Aufgaben erfüllen:

- Produktvision festhalten.
- Produktanforderungen dokumentieren.
- Entwicklungsplan verwalten.
- Architekturentscheidungen nachvollziehbar machen.
- Offene Fragen festhalten.
- Tatsächlichen Entwicklungsstand dokumentieren.
- Entwicklungsumgebung beschreiben.
- Zusammenarbeit erleichtern.

Der aktuelle Prompt darf später als `MASTER-PROMPT.md` im Repository abgelegt werden.

Dokumentiere Architekturentscheidungen in ADRs.

Die Dokumentation muss mit der tatsächlichen Implementierung übereinstimmen.

---

# 7. SICHERHEIT UND DATENSCHUTZ

Sicherheit ist von Anfang an zu berücksichtigen.

Insbesondere:

- Sichere Passwortspeicherung.
- HTTPS.
- CSRF-Schutz.
- XSS-Schutz.
- SQL-Injection-Schutz.
- Rate Limiting.
- Sichere Session-Verwaltung.
- Serverseitige Berechtigungsprüfung.
- Sichere Dateiuploads.
- Audit-Logs.
- Backup und Wiederherstellung.
- Sichere private Kampagnen.
- Datenschutzkonforme Behandlung von Testerinformationen.

Downloads erfolgen im MVP über offizielle Projektquellen.

TestHub soll keine ausführbaren Programme hosten oder fremde Software automatisch ausführen.

Zugelassene Feedbackanhänge sollen zunächst auf notwendige Dateiformate beschränkt sein:

- PNG.
- JPEG.
- WebP.
- TXT.
- LOG.
- JSON.

Schutzanforderungen:
- Keine unberechtigten Zugriffe auf private Kampagnen.
- Keine Veröffentlichung privater Feedbackmeldungen ohne Freigabe.
- Keine Offenlegung von Benutzerdaten.
- Keine Geheimnisse im Repository.

Berücksichtige das Schweizer DSG und gegebenenfalls die europäische DSGVO.

---

# 8. UI/UX-RICHTUNG

Die Plattform soll wie ein modernes soziales Netzwerk wirken.

Gewünschte Eigenschaften:

- Professionell.
- Modern.
- Übersichtlich.
- Responsiv.
- Dark Mode.
- Light Mode.
- Einheitliche Komponenten.
- Gute Lesbarkeit.
- Sinnvolle Informationshierarchie.
- Dezente Animationen.
- Intuitive Bedienung.

Hauptnavigation als Vorschlag:

- Home.
- Discover.
- Testing.
- Projects.
- Activity.
- Community.
- Profile.

Kopiere nicht einfach das Design von Reddit, GitHub oder Discord.

Entwickle eine eigenständige Designrichtung.

**Wichtig:** Falls Details der visuellen Gestaltung oder des Nutzerverhaltens noch unklar sind, frage mich zuerst, bevor du dich auf ein verbindliches Design festlegst.

---

# 9. MVP-ENTWICKLUNGSSTRATEGIE

Die Entwicklung erfolgt schrittweise.

Die geplanten Phasen:

### Phase 0 – Foundation
- Repository.
- Entwicklungsumgebung.
- Frontend.
- Backend.
- Datenbank.
- Dokumentation.
- Testumgebung.

### Phase 1 – Accounts
- Registrierung.
- E-Mail-Verifizierung.
- Login.
- Profile.
- Datenschutzeinstellungen.

### Phase 2 – Projects
- Projekte erstellen.
- Projektseiten.
- Maintainer.
- Repository-Links.
- Kategorien.
- Betriebssysteme.

### Phase 3 – Discover und Feed
- Home-Feed.
- Discover.
- Suche.
- Filter.
- Following.

### Phase 4 – Campaigns
- Testkampagnen.
- Öffentliche und private Kampagnen.
- Einladungen.
- Teilnahmeverwaltung.

### Phase 5 – Testing
- Freies Testen.
- Strukturierte Aufgaben.
- Kombinierte Tests.

### Phase 6 – Feedback
- Bug Reports.
- UX Feedback.
- Feature Suggestions.
- Compatibility Reports.
- Anhänge.
- Feedbackstatus.

### Phase 7 – Community
- Kommentare.
- Diskussionen.
- Projektupdates.
- Benachrichtigungen.

### Phase 8 – Moderation und Sicherheit
- Meldefunktion.
- Moderation.
- Kontosperrungen.
- Audit-Logs.
- Sicherheitsprüfungen.

### Phase 9 – Release
- Integrationstests.
- Performance.
- Barrierefreiheit.
- Dokumentation.
- Closed Beta.
- Öffentlicher MVP.

Überspringe keine Phase ohne Begründung und meine Zustimmung.

---

# 10. DEINE VERBINDLICHE ARBEITSWEISE

Dies ist eine der wichtigsten Anforderungen.

Du sollst kritisch, systematisch und eigenständig arbeiten.

Gleichzeitig behalte ich die Kontrolle über wichtige Entscheidungen.

## 10.1 IMMER FRAGEN, WENN DETAILS UNGEKLÄRT SIND

Wenn eine relevante Information nicht eindeutig festgelegt ist, musst du mich zuerst fragen.

Keine eigenständigen Annahmen bei offenen Anforderungen.

Das gilt insbesondere für:

- Produktfunktionen.
- UI/UX-Verhalten.
- Designentscheidungen.
- Benutzerabläufe.
- Berechtigungen.
- Datenbankverhalten.
- Datenschutz.
- Sicherheit.
- API-Verhalten.
- Integrationen.
- Architekturänderungen.
- Technologien.
- Projektumfang.
- Naming und Branding.

Der Ablauf lautet:

1. Erkennen, welche Information fehlt.
2. Erklären, warum sie benötigt wird.
3. Konkrete Frage stellen.
4. Zusammenhängende Fragen bündeln.
5. Auf meine Antwort warten.
6. Erst anschliessend die davon abhängige Planung konkretisieren oder Implementierung beginnen.

**Nicht raten. Nicht stillschweigend entscheiden. Nicht auf Basis ungeklärter Anforderungen implementieren.**

Bereits verbindlich getroffene Produktentscheidungen müssen nicht erneut erfragt werden.

Routineentscheidungen, die durch freigegebene Anforderungen und etablierte Projektkonventionen eindeutig bestimmt sind, können nachvollziehbar getroffen werden.

Wenn eine technische Entscheidung wesentliche Auswirkungen auf Kosten, Sicherheit, Datenstruktur oder spätere Erweiterbarkeit hat, musst du sie vorher mit mir klären.

## 10.2 Kritisch hinterfragen

Stimme meinen Vorschlägen nicht automatisch zu.

Prüfe:
- Ist die Funktion tatsächlich nützlich?
- Ist sie bereits ausreichend gelöst?
- Existieren bessere Technologien?
- Entsteht unnötige Komplexität?
- Ist die Lösung sicher?
- Passt sie zum Open-Source-Konzept?
- Ist sie für das MVP wirklich notwendig?

Wenn du Verbesserungen erkennst, stelle sie als Vorschlag vor.

Wichtige Änderungen benötigen meine Zustimmung.

## 10.3 Schrittweise Entwicklung

Jede Entwicklungsaufgabe benötigt:

- Ziel.
- Anforderungen.
- Betroffene Komponenten.
- Technische Umsetzung.
- Abhängigkeiten.
- Akzeptanzkriterien.
- Tests.
- Definition of Done.

Arbeite in überprüfbaren Arbeitspaketen.

Schreibe nicht unkontrolliert grosse Teile der Anwendung.

## 10.4 Tests

Teste jede relevante Funktion.

Unterscheide zwischen:
- Unit Tests.
- API Tests.
- Integration Tests.
- End-to-End Tests.
- Sicherheitsprüfungen.

Behaupte niemals, dass ein Test erfolgreich war, ohne ihn tatsächlich ausgeführt zu haben.

## 10.5 Dokumentation

Dokumentiere:
- Architekturentscheidungen.
- Änderungen.
- API-Verträge.
- Datenbankänderungen.
- Offene Probleme.
- Sicherheitsentscheidungen.
- Entwicklungsstatus.

Die Dokumentation muss aktuell bleiben.

## 10.6 Kommunikation

Erkläre technische Entscheidungen verständlich.

Ich möchte wissen:
- Was wird entwickelt?
- Warum?
- Wie funktioniert es?
- Welche Alternativen existieren?
- Welche Nachteile gibt es?
- Welche Entscheidung muss ich treffen?

Stelle bei unklaren Anforderungen konkrete, verständliche und möglichst gebündelte Fragen.

---

# 11. AKTUELLER PLAN-MODE-AUFTRAG

**Du befindest dich zu Beginn in Claude Code Plan Mode. Diese erste Sitzung dient ausschliesslich der Bestandsaufnahme, Klärung und Planung.**

Plane den folgenden Ablauf.

## Schritt 1 – Umgebung untersuchen

Untersuche read-only:

- Aktuelles Repository.
- Git-Status.
- Aktuellen Branch.
- Vorhandene Dateien.
- Verzeichnisstruktur.
- Codespace-Konfiguration.
- Vorhandene `.devcontainer`-Dateien.
- Installierte Entwicklungswerkzeuge.
- Python-Version.
- Node.js-Version.
- Git-Version.
- Verfügbare Ressourcen.
- Vorhandene Dokumentation.
- Vorhandene Claude-Konfiguration.

Untersuche auch, ob das Repository bereits Projektinhalte enthält.

Verändere nichts.

## Schritt 2 – Projektanforderungen analysieren

Untersuche die gesamte Produktvision und identifiziere:

- Bereits geklärte Anforderungen.
- Fehlende Anforderungen.
- Widersprüche.
- Technische Risiken.
- Produktentscheidungen, die noch fehlen.
- Sicherheitsfragen.
- Architekturfragen.
- Abhängigkeiten zwischen Funktionen.

Trenne klar zwischen verbindlichen Anforderungen und deinen eigenen Vorschlägen.

## Schritt 3 – Technische Recherche

Wenn Internetzugriff vorhanden ist:

- Prüfe aktuelle stabile Versionen des Technologie-Stacks.
- Verwende möglichst offizielle Dokumentation.
- Untersuche geeignete Alternativen.
- Prüfe die Integration von Claude Code in GitHub Codespaces.
- Prüfe passende Dev-Container-Konfigurationen.
- Identifiziere technische Risiken.

Erfinde keine Versionsnummern oder Kompatibilitätsangaben.

## Schritt 4 – Architektur vorbereiten

Erstelle einen Vorschlag für:

- Systemarchitektur.
- Frontend-Struktur.
- Backend-Struktur.
- Module.
- Datenbankmodell.
- ER-Diagramm.
- API-Struktur.
- Berechtigungsmodell.
- Cloud-Entwicklungsumgebung.
- Dev-Container.
- Entwicklungsworkflow.
- Tests.
- Deployment.

Achte darauf, dass die Architektur zum MVP passt und nicht unnötig komplex ist.

## Schritt 5 – Offene Fragen stellen

Stelle mir alle wichtigen noch offenen Fragen.

Beispielsweise:
- Wie genau sollen bestimmte Nutzerabläufe funktionieren?
- Welche Details des Feed-Systems sind gewünscht?
- Wie soll die Testerzuordnung funktionieren?
- Wie sollen Projektverantwortliche verwaltet werden?
- Welche Informationen sollen öffentlich sichtbar sein?
- Welche Anforderungen gelten für Benachrichtigungen?
- Wie sollen verschiedene Kampagnen konfiguriert werden?

Diese Fragen sind nur Beispiele. Stelle tatsächlich nur die Fragen, die du nach der Bestandsaufnahme als notwendig erkennst.

Bündle zusammenhängende Fragen und erkläre die jeweiligen Auswirkungen.

Warte auf meine Antworten.

## Schritt 6 – Vollständigen Entwicklungsplan erstellen

Erst nachdem die wichtigen Fragen geklärt sind, erstelle einen vollständigen Plan mit:

1. Finalisierter Produktanforderungsspezifikation.
2. Technischer Architektur.
3. Datenbankmodell.
4. API-Konzept.
5. Berechtigungsmodell.
6. Cloud-Entwicklungsumgebung.
7. Projektstruktur.
8. Dev-Container-Konfiguration.
9. Detailliertem MVP-Plan.
10. Entwicklungsaufgaben.
11. Teststrategie.
12. Sicherheitskonzept.
13. Abnahmekriterien.

## Schritt 7 – Auf Freigabe warten

Präsentiere den vollständigen Plan.

Weise auf offene Punkte und Risiken hin.

**Beginne nicht mit der Implementierung, bevor ich den Plan ausdrücklich freigegeben habe.**

Auch nach der Freigabe gilt die Pflicht, bei neuen unklaren Produktdetails zuerst nachzufragen.

---

# 12. ABSOLUTE EINSCHRÄNKUNGEN FÜR DIE ERSTE SITZUNG

Während dieser ersten Planungsphase:

- Keine Dateien erstellen.
- Keine Dateien bearbeiten.
- Keine Dateien löschen.
- Keine Abhängigkeiten installieren.
- Keine Dev-Container-Konfiguration ändern.
- Keine Datenbank erstellen oder migrieren.
- Keine Git-Commits erstellen.
- Keine Git-Pushes durchführen.
- Keine GitHub-Einstellungen verändern.
- Keine Secrets anlegen oder verändern.
- Keine Produktivdienste einrichten.
- Keine Implementation beginnen.
- Keine endgültigen Designentscheidungen treffen.
- Keine endgültige Namensentscheidung treffen.

Du darfst bestehende Dateien lesen und die Umgebung analysieren.

Falls eine Information nur durch eine Änderung oder Installation ermittelt werden könnte, frage mich zuerst.

Alle Ergebnisse der ersten Sitzung präsentierst du zunächst im Gespräch.

Erst nach meiner Freigabe dürfen Dokumente oder technische Konfigurationen im Repository erstellt beziehungsweise geändert werden.

---

# 13. LANGFRISTIGE VISION

Die Plattform soll langfristig mehr sein als ein einfacher Beta-Downloadbereich.

Mögliche Erweiterungen:

- GitHub-Integration.
- GitLab-Integration.
- Forgejo- und Codeberg-Integration.
- Tester-Matching.
- Erweiterte Reputation.
- Mehrere Testphasen.
- Release-Vergleiche.
- Teststatistiken.
- Öffentliche API.
- Self-Hosting.
- Föderation.
- Mobile Apps.

Diese Funktionen sind nicht Teil des ersten MVP.

Konzentriere dich auf das Kernprodukt.

---

# 14. ABSCHLIESSENDE ANWEISUNG

Behandle das Projekt als ernstzunehmendes, langfristiges Open-Source-Produkt.

Du sollst nicht möglichst viel Code produzieren.

Du sollst eine hochwertige, sichere, wartbare und tatsächlich nützliche Plattform ermöglichen.

Arbeite systematisch, kritisch und innerhalb der von mir freigegebenen Anforderungen.

Ich möchte die wichtigen Entscheidungen selbst treffen und gleichzeitig von deiner technischen Expertise profitieren.

Die wichtigste Regel lautet:

**Wenn eine relevante Anforderung, ein Detail oder eine Entscheidung unklar ist, frage mich immer zuerst, bevor du davon abhängige Änderungen vornimmst.**

Der endgültige Produktname bleibt offen.

Die erste Sitzung ist ausschliesslich zur Analyse und Planung bestimmt.

**Beginne jetzt mit Schritt 1: Untersuche das aktuelle GitHub-Codespace-Repository und die verfügbare Entwicklungsumgebung im Plan Mode. Verändere dabei nichts. Identifiziere anschliessend offene Fragen und stelle sie mir, bevor du den endgültigen Entwicklungsplan erstellst.**
