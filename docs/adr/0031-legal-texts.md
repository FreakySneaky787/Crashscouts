# 0031 – Legal texts

- Status: Accepted (texts are drafts pending a professional review)
- Date: 2026-11-15

## Context

Phase 8 needs a privacy policy, terms of use and an imprint before the beta. The owner decided
on 2026-11-15:
- Claude drafts the texts from the documented data processing, and a professional reviews them;
  this is not legal advice.
- English only.
- The operator is the owner as a private individual.
- At signup a notice only; nothing is stored.

Personal data must never be in the repository (CLAUDE.md), but FADP art. 19 and GDPR art. 13
require the operator's identity and contact details in the privacy policy.

## Decision

- **Texts:** `frontend/app/legal/{privacy,terms,imprint}.md`.
  - Rendered on `/privacy`, `/terms` and `/imprint` with the allowlist Markdown component.
  - Server-rendered, public, cacheable like other public pages.
  - Version and date in `lib/legal.ts`.
- **Operator details from the environment:** `OPERATOR_NAME`, `OPERATOR_ADDRESS` and
  `CONTACT_EMAIL` are filled into `{{…}}` placeholders.
  - Every Markdown and HTML character is escaped, so a setting cannot add links or markup.
  - Missing values show a visible placeholder.
  - With `PUBLIC_DEPLOYMENT=true` the SSR server refuses to start while one of them is empty.
- **Draft notice:** every page says "Draft – not yet reviewed" until `LEGAL_TEXTS_REVIEWED=true`,
  which only the owner sets after the review.
- **Open points in the text:** whatever the platform does not determine yet is written as a visible
  `[TO DECIDE: …]` in the text, never guessed. That covers the hosting provider, web server logs,
  backups, the processing agreement with the email provider, the transfer basis for GitHub, the EU
  representative, SPDX attribution and the place of jurisdiction.
- **Footer on every page:** privacy policy, terms of use, imprint, and "Source code (AGPL-3.0)"
  from `SOURCE_CODE_URL` (https only). The source link is hidden while that setting is empty; the
  repository is still private (WP 8.7).
- **Signup:** one sentence under the button links the terms and the privacy policy.
- **No cookie banner:** only strictly necessary cookies (session, CSRF, theme preference).

## Alternatives

- Operator details in the repository: personal data in Git, contrary to the project's rules.
- Stored acceptance with versions: rejected by the owner for now (notice only).
- Texts in the i18n file: too long, and harder to hand to a reviewer than Markdown files.

## Consequences

- The reviewer receives the three Markdown files and the list of `[TO DECIDE]` points.
- A real deployment needs the operator settings; the check enforces that.
- Drafting found that django-allauth stored the full public GitHub profile in `extra_data`. The
  owner decided on 2026-11-15 to keep only account number, username and profile link (question
  Z): a `pre_save` signal trims every GitHub account, and migration `accounts/0005` trims the
  rows stored before.

## Update 2026-11-18

The reviewer approved the drafts and the owner decided the remaining points (OPEN-QUESTIONS Y):
no EU representative, the GitHub transfer under the Data Privacy Framework, SPDX attribution
with a link and no place-of-jurisdiction clause. Version 1.0 of all three texts.
