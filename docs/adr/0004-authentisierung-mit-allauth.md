# 0004 – Authentisierung mit django-allauth

- Status: Akzeptiert
- Datum: 2026-11-12

## Kontext

Entschieden sind: E-Mail und Passwort mit Verifizierung, Login mit GitHub, optionale 2FA (TOTP, Passkeys) und ⚑ Pflicht-2FA für Owner öffentlicher Kampagnen und für Moderatoren. Das Frontend ist eine SSR-App, die über HTTP mit Django spricht. Eine eigene Authentisierung zu bauen wäre ein unnötiges Sicherheitsrisiko.

## Entscheidung

- `django-allauth` (MIT) im **Headless-Modus** (`allauth.headless`) mit `allauth.account`, `allauth.socialaccount` (GitHub) und `allauth.mfa` (TOTP, WebAuthn, Recovery-Codes).
- Auth läuft über Browser-Sessions mit Cookies am gleichen Origin, nicht über Tokens im Browser.
- Custom-User-Modell ab Tag 1. Konto und Login-Identität sind getrennt, damit später weitere Anbieter möglich sind.

## Alternativen

- **Eigene Implementierung:** hohes Fehlerrisiko.
- **dj-rest-auth oder JWT-Lösungen:** Tokens im Browser vergrössern die Angriffsfläche bei XSS; MFA müsste separat gelöst werden.

## Konsequenzen

- allauth-Updates werden genau verfolgt, weil Sicherheitsfixes dort regelmässig erscheinen.
- Wie der Django-Admin-Login an die MFA gekoppelt wird, wird bei der Implementierung in der offiziellen Doku geprüft.

## Quellen

- [allauth: Headless-Installation](https://docs.allauth.org/en/latest/headless/installation.html)
- [allauth: WebAuthn](https://docs.allauth.org/en/latest/mfa/webauthn.html)
- [PyPI: django-allauth](https://pypi.org/project/django-allauth/): Version 65.22.0 am 2026-11-12, deklariert Django 4.2 bis 6.1 und Python 3.11 bis 3.14.
