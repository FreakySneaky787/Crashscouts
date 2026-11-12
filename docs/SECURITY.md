# Sicherheitskonzept

> Stand: 2026-11-12 · Status: **geplant**. Welche Massnahmen bereits umgesetzt und getestet sind, steht in [`STATUS.md`](STATUS.md).
> Wie Schwachstellen gemeldet werden, steht in der [`SECURITY.md`](../SECURITY.md) im Repo-Wurzelverzeichnis.

Grundsatz: lieber dreifach abgesichert als einmal. Jede Schutzmassnahme braucht einen automatisierten Test, auch für die Negativfälle.

## 1. Bedrohungsschwerpunkte

1. **Schadsoftware über Download-Links.** Freiwillige installieren unbekannte Vorabversionen. Das ist der grösste Missbrauchsweg.
2. **Datenlecks bei privaten Kampagnen und privatem Feedback.** Logs und Screenshots enthalten oft Personendaten oder Hinweise auf Schwachstellen.
3. **Kontoübernahmen** von Owners und Moderatoren, die die grösste Hebelwirkung haben.
4. **Klassische Web-Angriffe:** XSS, CSRF, Injection, Upload-Missbrauch.
5. **Geheimnisse im Repository und Angriffe über die Lieferkette.**

## 2. Konten

- Passwörter mit Argon2id; allauth-Ratelimits für Login, Registrierung und Reset.
- E-Mail-Verifizierung ist Pflicht.
- 2FA (TOTP, Passkeys, Recovery-Codes) ist optional; ⚑ Pflicht für Owner öffentlicher Kampagnen und für Moderatoren.
- Neue Session nach dem Login; Cookies mit `HttpOnly`, `Secure` und `SameSite=Lax`; Session-Liste mit „überall abmelden".

## 3. Web

- Django-CSRF.
- Strikte Content-Security-Policy (Django-6.x-Bordmittel oder `django-csp`; wird bei der Implementierung geprüft).
- HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.
- Nur das ORM; Raw-SQL nur mit Review.
- React escapt Ausgaben; `dangerouslySetInnerHTML` ist per Lint-Regel verboten.
- Markdown wird nur über eine Sanitizer-Allowlist gerendert.

## 4. Download-Links und Sicherheits-Gate

- Nur `https://`.
- Warnseite vor jedem externen Link; `rel="noopener noreferrer nofollow ugc"`.
- **Öffentliche Kampagnen sind technisch gesperrt** (`PUBLIC_CAMPAIGNS_ENABLED=false`), bis das Gate aus [`MVP-PLAN.md`](MVP-PLAN.md), Phase 3B, erfüllt ist.
- Prüfqueue für jede neue öffentliche Kampagne; ⚑ eine Linkänderung löst eine erneute Prüfung aus.
- Wartezeit oder manuelle Freigabe für neue Konten (offene Frage A).
- Abzeichen „Repository verifiziert" nach Inhaberschaftsnachweis.
- Meldefunktion und sofortige Sperre durch Admins; gesperrte Links werden niemandem mehr ausgeliefert.

## 5. Uploads

- Allowlist: PNG, JPEG, WebP, TXT, LOG, JSON. Geprüft werden Endung, MIME-Typ **und** Magic Bytes.
- Grössen- und Anzahllimits.
- Bilder werden mit Pillow neu kodiert (entfernt EXIF/GPS).
- Zufällige Dateinamen, Speicherung ausserhalb des Webroots.
- Auslieferung nur über eine autorisierte Django-Route mit `Content-Disposition: attachment` und `nosniff`; Text-Logs werden nie als HTML gerendert.

## 6. Privatsphäre und Berechtigungen

- Eine zentrale, serverseitige Policy-Schicht. Private Ressourcen liefern 404.
- Parametrisierte Tests der Berechtigungsmatrix, inklusive „ein Fremder sieht nichts".
- Einladungstoken werden nur gehasht gespeichert, laufen ab und sind nur einmal verwendbar.
- Moderatoren erhalten keinen pauschalen Zugriff auf private Inhalte; Zugriffe sind zweckgebunden und protokolliert.

## 7. Admin-Zugang

- Der öffentliche Proxy routet `/admin/` **nicht** (Antwort 404).
- Django-Admin lauscht nur auf `127.0.0.1` und ist nur per SSH-Tunnel erreichbar; der SSH-Zugang ist schlüsselbasiert, die Passwort-Anmeldung deaktiviert.
- 2FA beim Admin-Login ist Pflicht. Der Mechanismus der allauth-Integration wird bei der Implementierung in der offiziellen Doku geprüft.
- Nur wenige `is_staff`-Konten; jede Admin-Anmeldung landet im Audit-Log.
- Ein CI-Test stellt sicher, dass der Proxy `/admin/` nicht weiterleitet.

## 8. SSR, Sessions und Caching

- Der SSR-Server reicht `Cookie` an Django weiter und gibt `Set-Cookie` unverändert an den Browser zurück.
- Schreibende Anfragen tragen das CSRF-Token im Header. Django prüft es; der SSR-Server umgeht es nie.
- **Private Antworten:** `Cache-Control: private, no-store` und `Vary: Cookie`.
- **Öffentliche anonyme Seiten:** Caching nur ohne Session-Cookie und nie für personalisierte Inhalte.
- Kein gemeinsamer Cache für nutzerbezogene Daten im SSR-Server.

## 9. Audit-Log

Append-only. Protokolliert werden: Login-Ereignisse, Rollenänderungen, Moderation, Zugriffe von Moderatoren auf private Inhalte, Admin-Anmeldungen, Löschungen und Exporte.

## 10. Repository und Lieferkette

- **Keine Secrets im Repo.** `.env*` steht in `.gitignore`; Vorlagen kommen als `.env.example`.
- **gitleaks** als pre-commit-Hook und in CI (ab AP 0.6). Bis dahin wird jeder Commit manuell mit gitleaks geprüft.
- **Einschränkung von GitHub Free bei privaten Repos:** keine Push Protection beim Secret Scanning, kein Branch-Schutz und keine Rulesets. Deshalb sind gitleaks und CI die Schutzschicht, bis das Repo öffentlich ist. Danach werden alle kostenlosen GitHub-Funktionen aktiviert.
  Quellen: [Push Protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection), [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
- Lockfiles; `pip-audit` und `pnpm audit` in CI; Dependabot (ob es für private Repos verfügbar ist, wird in AP 0.6 geprüft).
- GitHub Actions werden auf Commit-SHA gepinnt.
- Werkzeuge kommen nur aus offiziellen Quellen mit Prüfsummen oder signierten Registries.

## 11. Claude Code in der Entwicklungsumgebung

- Läuft als Nicht-root-Nutzer; kein `--dangerously-skip-permissions`.
- Keine Host-Secrets (`~/.ssh`, Cloud-Zugangsdaten) im Container.
- Authentisierung nur über ein Codespaces-Secret (`CLAUDE_CODE_OAUTH_TOKEN` oder `ANTHROPIC_API_KEY`).
  Quelle: [Claude Code Dev Container](https://code.claude.com/docs/en/devcontainer).

## 12. Betrieb (vor der Beta)

- TLS über den Reverse Proxy; die Datenbank hat keinen öffentlichen Port.
- Automatische, verschlüsselte, ausgelagerte PostgreSQL-Backups mit **getesteter** Wiederherstellung.
- Sicherheitsreview nach OWASP ASVS Level 1 vor der Closed Beta.
