# 0015 – Repository verification

- Status: Accepted
- Date: 2026-11-13

## Context

Testers should be able to see that a project really belongs to the repository it links to
(open question B). This is one building block of the layered download protection in phase 3B.
The project owner decided (2026-11-13):

- a **check file** in the repository, on **GitHub, GitLab.com and Codeberg**;
- for GitHub projects also a **one-time GitHub authorization**: the token is discarded immediately
  and never stored.

This is the first feature in which the server sends requests to third-party servers. A user must
never be able to make the server request an address of their choosing (server-side request
forgery, SSRF).

## Decision

1. **Fixed hosts and addresses.** Only `https://github.com`, `https://gitlab.com` and
   `https://codeberg.org` repository links (`https://<host>/<owner>/<repository>`, GitLab with
   nested groups, at most 10 path segments) are supported. Path segments must match
   `[A-Za-z0-9][A-Za-z0-9._-]{0,99}` and must not end with a dot; credentials, ports, query strings
   and fragments are rejected. The server builds the API addresses itself
   (`apps/projects/repositories.py`) and contacts only the official APIs:
   - GitHub REST: `GET /repos/{owner}/{repo}` and
     `GET /repos/{owner}/{repo}/contents/{path}` with `Accept: application/vnd.github.raw+json`;
   - GitLab REST v4: `GET /projects/:id` and
     `GET /projects/:id/repository/files/:file_path/raw?ref=HEAD`;
   - Codeberg (Forgejo, Gitea-compatible API v1): `GET /repos/{owner}/{repo}` and
     `GET /repos/{owner}/{repo}/raw/{filepath}`.
2. **Request limits:** 5 s timeout, **no redirects followed** (a moved repository reports
   `repository_moved`), bodies read in chunks and aborted above 4 KB (check file) or 256 KB (JSON).
   The environment's proxy settings apply.
3. **Public repositories only.** The repository's visibility is read first (`private` on GitHub
   and Codeberg, `visibility` on GitLab); a missing or private repository fails with
   `not_public`. Private repositories would need access rights (on GitHub the broad `repo` scope).
4. **Check file:** `.<platform-slug>-verification` in the root of the default branch (name derived
   from `PLATFORM_NAME`, overridable with the setting `PROJECT_VERIFICATION_FILENAME`), containing
   a random code (`secrets.token_urlsafe(24)`). The content is compared in constant time after
   trimming whitespace and a byte-order mark.
5. **GitHub authorization:** a separate OAuth web flow with the existing OAuth app and an empty
   `scope` (read-only access to public information). The `state` is signed (Django signing,
   10 minutes), names project, user and repository link, and carries a nonce stored in the session
   that is used up on the first callback. On the callback the server exchanges the code, reads
   `GET /repos/{owner}/{repo}` with the token and requires `permissions.maintain` or
   `permissions.admin`, then **revokes the token** (`DELETE /applications/{client_id}/token`, basic
   authentication with client ID and secret) – also when the check fails. The token is never
   stored, logged or returned. The callback is a GET like every OAuth callback; the signed,
   session-bound, single-use `state` replaces the CSRF token (RFC 6749, section 10.12).
6. **Binding to the link.** The check code and the proof belong to exactly one repository link.
   Changing the link deletes both; switching back requires a new check.
7. **Team only.** Only owner and maintainers see the status and the code and start checks; all
   others get 404. At most 10 checks per hour **per project** (shared by the team, so the code
   hosts are not hammered through one project).
8. **Audit:** `project.verified` and `project.verification_failed` with method and error code,
   never a token.

The public project page shows the badge "Repository verified" (status pill with shield icon and a
one-line explanation).

## Alternatives

- Fetch arbitrary `https` URLs (e.g. raw files on any host): rejected; SSRF risk and no reliable
  visibility check.
- Raw-file URLs (`raw.githubusercontent.com` and similar) instead of the APIs: rejected; the APIs
  also give the visibility and are documented.
- Keep the token from the GitHub login (`SOCIALACCOUNT_STORE_TOKENS`): rejected; the owner decided
  that tokens are never stored.
- Verification of private repositories: postponed; would need broad scopes or deploy keys.

## Consequences

- Production needs outgoing HTTPS to `api.github.com`, `github.com`, `gitlab.com` and
  `codeberg.org`.
- The GitHub OAuth app needs a **second callback URL**:
  `<frontend>/projects/github/verify/callback`. OAuth apps on github.com accept up to 10 callback
  URLs; wildcard matching should stay off (GitHub's recommendation).
- Unauthenticated GitHub API requests are rate-limited per server IP address; with many checks the
  file way may answer `host_unavailable` until the limit resets.
- If a user has already granted the OAuth app scopes (e.g. through the GitHub login), GitHub may
  issue the token with those scopes despite the empty `scope`; it is revoked right away either way.
- **Not yet verified against the live services** (no access from the development environment;
  to be checked on the first test server, open question U):
  - that `permissions` is present in the repository response for a token without scopes;
  - that Codeberg's Forgejo answers the Gitea API v1 endpoints as specified (codeberg.org is not
    reachable from the development environment; checked against Gitea's specification).

## Sources

- GitHub REST API description (OpenAPI 1.1.4), `github/rest-api-description`:
  repository contents, `full-repository` (`private`, `permissions`), `DELETE
  /applications/{client_id}/token` (body `access_token`, 204).
- GitHub docs repository `github/docs` (commit `b02f1f6`, 2026-11-12):
  `content/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps.md` (parameters, `scope`
  behaviour, redirect URLs), `creating-an-oauth-app.md` (up to 10 callback URLs),
  `scopes-for-oauth-apps.md` (no scope = public information),
  `content/rest/authentication/authenticating-to-the-rest-api.md` (basic authentication with
  client ID and secret for `/applications/{client_id}/token`).
- GitLab documentation (`gitlab-org/gitlab`, `doc/api/repository_files.md`, `doc/api/projects.md`).
- Gitea API specification (`go-gitea/gitea`, `templates/swagger/v1-swagger.generated.json`).
- RFC 6749 (OAuth 2.0), sections 4.1.2 and 10.12: https://www.rfc-editor.org/rfc/rfc6749
