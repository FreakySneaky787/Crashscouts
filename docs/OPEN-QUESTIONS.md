# Offene Fragen

> Stand: 2026-11-12. Jede Frage wird **vor** der Phase geklärt, in der sie gebraucht wird. Bis dahin wird nichts implementiert, was von ihr abhängt.
> Die Spalte „Vorschlag" ist eine Empfehlung, **keine** Entscheidung.

## Produkt

| # | Frage | Bis | Vorschlag |
|---|---|---|---|
| A | Wartezeit neuer Konten, bevor sie öffentliche Kampagnen einreichen dürfen | Phase 3B | 7 Tage plus verifizierte E-Mail plus 2FA, oder manuelle Freigabe durch Admin |
| B | Methode der Repository-Verifizierung | Phase 2 | Datei mit Token im Repo (unabhängig vom Code-Hosting-Anbieter), zusätzlich Prüfung per GitHub-OAuth |
| C | Ist `target_testers` eine harte Grenze (automatisch „Full")? Wann wechselt der Status auf „In Progress"? | Phase 3A | harte Grenze bei direkter Teilnahme; „In Progress" ab `starts_at` |
| D | Was sehen Teilnehmende voneinander? Standard-Sichtbarkeit von Profilen | Phase 1 / 3A | Teilnehmende sehen sich gegenseitig nicht; Profile sind standardmässig minimal öffentlich |
| E | **Visuelle Richtung, Komponentenbibliothek, Styling** | vor Phase 1 | 2–3 Richtungen als Mockups vorlegen; Entscheidung durch den Projektverantwortlichen |
| F | Anbieter für Transaktions-E-Mails (Schweiz/EU) | Phase 1 | In der Entwicklung Mailpit oder Konsole; Anbieter vor der Beta |
| G | Beitragsmodell: DCO oder CLA | vor dem Öffentlichschalten | DCO |
| H | Wer moderiert anfangs? | Phase 3B | nur der Projektverantwortliche |
| I | Sprache der Repo-Doku (aktuell Deutsch) | vor dem Öffentlichschalten | README, CONTRIBUTING und SECURITY auf Englisch für die internationale Community; interne Planungsdoku darf deutsch bleiben |
| J | Verhaltenskodex (Code of Conduct) | vor dem Öffentlichschalten | etablierte Vorlage, Auswahl durch den Projektverantwortlichen |
| K | Endgültiger Produktname, Logo, Domain | offen | Entscheidung ausschliesslich durch den Projektverantwortlichen |

## Recht (keine Rechtsberatung; vor der Beta juristisch prüfen lassen)

- Als Privatperson muss der Betreiber in der Datenschutzerklärung seine Identität und Kontaktdaten angeben (DSG Art. 19 Abs. 2 lit. a; DSGVO Art. 13).
- Die DSGVO gilt voraussichtlich zusätzlich, weil sich das Angebot an Personen in der EU richtet (Art. 3 Abs. 2 DSGVO).
- Ob ein EU-Vertreter nach Art. 27 DSGVO nötig ist, ist zu prüfen; Ausnahmen gelten für gelegentliche Verarbeitung mit geringem Risiko.
- Die Nutzungsbedingungen brauchen einen Haftungsausschluss für Links auf Fremdsoftware und ein Meldeverfahren.
- AGPL-3.0: Die gehostete Version muss einen Link zum Quellcode anbieten (Footer).

Quellen: [DSG (Fedlex)](https://www.fedlex.admin.ch/eli/cc/2022/491/de) · [DSGVO (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2016/679/oj)

## Technik

| Thema | Bis |
|---|---|
| Hosting-Anbieter (Schweiz/EU) und Objektspeicher | Phase 8 |
| Ob Dependabot für private Repos kostenlos verfügbar ist | AP 0.6 |
| Upgrade auf Django 6.2 LTS (geplant April 2027) | nach Release |
| Wechsel auf TypeScript 7, sobald typescript-eslint es unterstützt | laufend |
