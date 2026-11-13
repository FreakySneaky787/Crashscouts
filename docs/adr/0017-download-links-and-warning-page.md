# 0017 – Download links and warning page

- Status: Accepted
- Date: 2026-11-13

## Context

Campaigns point testers to the software under test. The master prompt rules out hosting or running
third-party software ("downloads go through official project sources") and requires a warning page
before external links ([`SECURITY.md`](../SECURITY.md), section 4). Malicious links are the main
abuse risk of the platform. The project owner decided (2026-11-13):

- any `https` link is allowed, behind a warning page that makes the origin clear and says whether
  the link lies in the verified repository;
- only the **team and participants** see the links;
- an **optional SHA-256 checksum** per link.

## Decision

1. **Model** `CampaignLink`: label, URL, optional platform, optional SHA-256 (lowercase hex), at
   most 10 per campaign. Completed and cancelled campaigns keep their links but cannot change them.
2. **URL rules** (`validate_download_url`): `https` only; no user name or password; port only the
   default; no IP addresses; no `localhost` or single-label names; no local or reserved suffixes
   (`.local`, `.internal`, `.lan`, `.home`, `.arpa`, `.test`, `.invalid`, `.localhost`); host labels
   ASCII only (internationalised names must be entered as punycode, so look-alike letters such as
   Cyrillic "о" cannot pass as Latin ones); no whitespace or control characters; at most 500
   characters.
3. **The server never fetches a link** (no SSRF risk, no scanning). Links are data.
4. **Visibility:** the links API answers 404 to everyone except the team and participants, also
   for public campaigns. Only the team adds, changes or removes links.
5. **Warning page** `/p/<project>/c/<campaign>/download/<id>`: domain in bold, full address,
   whether it lies in the verified repository (same host and a path below
   `/<owner>/<repository>/`, only while the repository verification is valid), platform, checksum
   in blocks of eight with commands for Windows, macOS and Linux, and a clear statement that the
   platform neither hosts nor checks the file. It never forwards by itself; the outgoing link has
   `rel="noopener noreferrer nofollow ugc"` and `referrerpolicy="no-referrer"`; the site-wide
   `Referrer-Policy: same-origin` already sends no referrer to other sites. The page is
   `noindex, nofollow` and never cached.
6. **Audit:** `campaign.link_added/changed/removed` with campaign, link ID and host. Phase 3B
   builds on these events: a link change of an approved public campaign triggers a new review.

## Alternatives

- Links only into the verified repository: rejected by the owner (excludes closed-source projects
  and official websites).
- Fetching or scanning the files: rejected; the server would download untrusted software and
  become an SSRF vector.
- Mandatory checksums: rejected by the owner (store pages and rolling installers have none).

## Consequences

- Checksums are only as trustworthy as the team that enters them; they protect against altered
  mirrors and corrupted downloads, not against a malicious team. Reporting and blocking follow in
  phase 3B.
- Internationalised domain names appear in punycode form.

## Sources

- Master prompt, sections 3.5 and 5 (`docs/MASTER-PROMPT.md`).
- Unicode Technical Standard #39 (confusable characters): https://www.unicode.org/reports/tr39/
- `rel` values: https://html.spec.whatwg.org/multipage/links.html#linkTypes
