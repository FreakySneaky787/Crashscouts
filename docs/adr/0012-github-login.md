# 0012 – GitHub login

- Status: Accepted
- Date: 2026-11-12

## Context

The project owner decided to offer GitHub login next to email and password, with **no automatic
linking** of an existing account by email (open questions, phase 1). allauth's social login builds
callback URLs from the request host, but in our setup Django only sees the internal host the SSR
server (or later the reverse proxy) uses.

## Decision

1. **allauth `socialaccount` with the GitHub provider** (extra `socialaccount`: `requests` 2.34.2,
   Apache-2.0; `oauthlib` 4.0.1, BSD-3-Clause; `pyjwt`, MIT). Scopes `read:user` and `user:email`
   only, no repository access; GitHub access tokens are not stored.
2. **Credentials only from the environment** (`DJANGO_GITHUB_CLIENT_ID`,
   `DJANGO_GITHUB_CLIENT_SECRET`). Without them the provider is not offered at all.
3. **No automatic linking or login by email** (`SOCIALACCOUNT_EMAIL_AUTHENTICATION=False`).
   Linking only from a signed-in session in the security settings ("connect"); a connect flow
   started without a session ends with `permission_denied` and links nothing.
4. **Signup form always** (`SOCIALACCOUNT_AUTO_SIGNUP=False`): username and the 16+ confirmation
   are required like in the normal signup; the GitHub email is prefilled.
5. **Public host via `X-Forwarded-Host`:** the SSR server forwards the public host and Django uses
   it (`USE_X_FORWARDED_HOST`), so the callback is `<public origin>/accounts/github/login/callback/`.
   Django is never reachable directly; the reverse proxy must overwrite `X-Forwarded-Host` and
   `X-Forwarded-Proto` with its own values.
6. **The callback runs through the SSR server** (route `accounts/github/login/callback`, forwarding
   query and cookies); in production the proxy may route it to Django directly. Redirects are only
   followed to GitHub's authorization page (`https://github.com/login/oauth/authorize`) or to local
   paths.
7. **CSP `form-action 'self' https://github.com`:** the login button is a plain form (works without
   JavaScript); its answer is a redirect to GitHub, which browsers check against `form-action`.
   Only GitHub's origin is added (paths are ignored for redirects by the CSP specification).

## Alternatives

- Override allauth's callback URL in a custom provider adapter: needs custom views and URLs for
  one setting; forwarding the public host also fixes every other URL Django builds.
- Callback directly to Django on another port in development: would differ from production
  (same origin) and needs a second registered callback.
- GitHub App instead of an OAuth app (GitHub's own recommendation for integrations): finer
  permissions are not needed for sign-in only; allauth's GitHub provider targets OAuth apps.

## Consequences

- The GitHub OAuth app's callback URL is `http://localhost:3000/accounts/github/login/callback/`
  for local use; production needs a separate OAuth app with the real domain.
- E2E tests use dummy credentials, never contact GitHub, and check the redirect target, the forged
  state on the way back and the CSP.

## Sources

- django-allauth 65.22.0 social login behaviour: source of the installed package
  (`allauth/urls.py`, `socialaccount/providers/oauth2/views.py`, `socialaccount/providers/github/views.py`,
  `headless/socialaccount/forms.py`, `account/adapter.py` `is_safe_url`).
- GitHub OAuth apps (source of the official docs, `github/docs` repository):
  https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app ·
  https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- Django `USE_X_FORWARDED_HOST`: https://docs.djangoproject.com/en/6.1/ref/settings/#use-x-forwarded-host
- CSP `form-action` and redirects: https://www.w3.org/TR/CSP3/#directive-form-action
- Package licences and versions: PyPI metadata of requests, oauthlib and pyjwt.

## Addendum 2026-11-15 – data minimisation

Only the GitHub account number, username and profile link are kept in `SocialAccount.extra_data`;
everything else GitHub sends is dropped before saving (`apps/accounts/socialdata.py`, owner's
decision, question Z). Migration `accounts/0005` trims older rows.
