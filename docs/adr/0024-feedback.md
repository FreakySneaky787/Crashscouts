# 0024 – Feedback

- Status: Accepted
- Date: 2026-11-14

## Context

Phase 5 of the MVP plan: five feedback types with type-specific fields (master prompt 3.7),
secure attachments (master prompt 4: PNG, JPEG, WebP, TXT, LOG, JSON only), a status workflow,
private by default and publishable one by one, and an inbox for the team. ADR 0013 requires that
feedback of deleted accounts is anonymised, not deleted, and that the data export includes it.

The project owner decided (2026-11-14):

1. Private feedback is seen by the team, its author and **all active participants** of the
   campaign; **attachments only by the team and the author**.
2. Publishing: **the team proposes, the author consents**. Only then is the feedback public for
   everyone who may see the campaign; attachments stay private even then.
3. The team sets the statuses up to "Fixed"; **the author confirms with "Verified" or reopens**.
4. Notifications: the team sees a count of new feedback (no email per feedback); the author gets a
   short email when the status changes and sees it on the account page.
5. Attachments: at most 5 per feedback, images up to 5 MB, text up to 2 MB.
6. Authors may **change or withdraw** their feedback **while it is "New"**.
7. Feedback can optionally name a **test task**.

## Decision

- **App `apps.feedback`**, built on campaigns. `Feedback` (campaign, author SET_NULL, kind,
  title, Markdown description, type-specific fields, platform, version, optional task, status,
  `duplicate_of`, `publish_proposed_at`, `author_consented_at`, `published_at`) and
  `FeedbackStatusChange` (status history with the role "team" or "author"; the API never shows
  who in person).
- **Fields per kind:** bug report – steps, expected and actual behaviour (required), platform,
  version (defaults to the campaign's); UX feedback – where in the product, suggestion;
  feature suggestion – the description is the problem, plus a proposed solution (required);
  compatibility report – platform and result (works, partly, does not work; required),
  environment, version; general feedback – title and description only. Fields that do not belong
  to the kind are cleared.
- **Who gives feedback:** active participants of a published, unblocked campaign, also after its
  end date until the team completes it. The team does not give feedback on its own campaigns.
- **Visibility (`apps/feedback/policies.py`, the only place that decides):** the team sees all;
  the author always sees their own, also after leaving (via the account page); active
  participants of a campaign they can see read all of its feedback; published feedback is
  readable by everyone who can see the campaign. Everything else is a plain 404. Blocked
  campaigns and projects hide their feedback from everyone but the team (ADR 0020). Who wrote a
  feedback is shown only to the team and the author; everyone else sees "a tester" (consistent
  with decision D: only the team sees who takes part).
- **Status workflow:** the team sets Reviewed, Confirmed, In Progress, Fixed, Duplicate (pointing
  to another feedback of the same campaign), Cannot Reproduce and Rejected, in any order. The
  author can only go from Fixed to Verified or back to Confirmed (reopened). Every change is kept
  in the history; team changes email the author.
- **Publishing:** `…/publish/propose/` (team), `…/publish/consent/` (author, after a proposal),
  `…/publish/withdraw/` (either side; private again, both steps start over). Publishing and
  unpublishing are audit events.
- **Rate limits:** giving feedback 30 per day and account, 60 per day and IP address (ADR 0022).
- **Personal data:** the author becomes NULL on final account deletion; the text stays,
  anonymised. The data export contains the person's own feedback.
- **API:** `…/campaigns/<c>/feedback/` (list with filters kind, status, task; create),
  `…/feedback/<id>/` (read, change, withdraw), `…/feedback/<id>/status/`,
  `…/feedback/<id>/publish/<action>/`, `/api/v1/me/feedback/`; `new_feedback` in the campaign
  response for the team. The feedback routes are included before the campaign routes, whose
  catch-all state route would otherwise take `…/feedback/`.

## Attachments (WP 5.2)

- `FeedbackAttachment` (kind image or text, cleaned display name, size, random key); at most 5
  per feedback; added and removed only by the author while the feedback is "New".
- **Images** (`.png`, `.jpg`, `.jpeg`, `.webp`) go through the shared pipeline
  (`apps/core/images.py`, ADR 0010): at most 5 MB, signature and Pillow checks, pixel limit
  against decompression bombs, re-encoded as WebP with the longest side at most 2560 px and no
  metadata. Served inline with `Content-Security-Policy: default-src 'none'; sandbox`.
- **Text** (`.txt`, `.log`, `.json`): at most 2 MB, valid UTF-8, no NUL bytes, JSON must parse.
  Stored as uploaded, served **only as a download** (`Content-Disposition: attachment`,
  `text/plain; charset=utf-8`), never rendered.
- Every other type (SVG, executables, scripts, binaries named `.log`, files without an extension)
  is refused. Requests larger than the image limit are refused before the body is parsed.
- Delivery (`/api/v1/feedback-attachments/<key>/`) checks on every request that the person is in
  the team or the author (404 otherwise, also for published feedback), with `nosniff` and
  `private, no-store`. Rate limits: 60 uploads per hour and account, 120 per IP address.
- Files are deleted with their row, with the feedback (withdrawn) and on final account deletion
  (they may contain personal data; the feedback text stays, anonymised).

## The team's inbox (WP 5.4)

- `/p/<p>/c/<c>/feedback`: team only (404 for everyone else); filters kind, status and task as a
  plain GET form; each entry shows kind, author, task, number of files and date. Campaign page and
  testers page show "x new feedback" with a link (no email, owner's decision).
- On the feedback page the team sets the status (Duplicate with the original chosen from the
  campaign's other feedback), proposes publishing or withdraws the proposal.
- The progress overview counts feedback per task (`feedback` in `…/progress/`).

## Alternatives

- Private feedback visible to the team and the author only (recommended at first): the owner
  chose all participants to help them avoid duplicates; attachments stay with the team and the
  author because logs and screenshots often contain personal data.
- Publishing by the team alone, or no publishing in the MVP: rejected by the owner.

## Consequences

- Participants read each other's texts: the form must say so before sending.
- Attachments (WP 5.2) need their own, stricter delivery checks.
- Reporting published feedback follows in phase 7.
- Published feedback appears in the feedback list of a public campaign page, which anonymous
  visitors may get from a shared cache for up to 60 seconds; after it is made private again it
  can stay in that list for up to 60 seconds. The feedback page itself is never cached.
