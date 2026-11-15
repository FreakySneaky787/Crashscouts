# 0027 – Account suspensions

- Status: Accepted
- Date: 2026-11-14

## Context

Phase 7 of the MVP plan asks for account suspensions with deadlines and appeals. Until now
moderators could only warn a person (ADR 0026). The project owner decided (2026-11-14):

- A suspension makes the account **read only**: signing in, reading, the data export and deleting
  the account stay possible; creating, reporting, giving feedback, joining and inviting do not.
  The profile is hidden from others. The person sees the reason and can appeal once.
- **Any moderator** suspends, with a **free end date or permanently**.
- **Any moderator** decides the appeal, also the one who suspended.

The last two points together mean there is no four-eyes principle; the owner accepted this.

## Decision

- **Model `AccountSuspension`** (app `moderation`): person (CASCADE), reason (the reasons for
  people, ADR 0026), message to the person, `ends_at` (NULL = permanently), who suspended, lifting
  (when, by whom), one appeal (text, time) and its decision (upheld or lifted, when, by whom).
  A suspension is in force while it is not lifted and `ends_at` is empty or in the future; the
  end needs no background job.
- **One central write guard** (`apps.moderation.middleware.SuspensionGuard`, after Django's
  authentication middleware): every request other than GET, HEAD and OPTIONS of a suspended
  account answers 403 `{"code": "account_suspended"}`, except an explicit list of paths: sign
  out and the steps of signing in or reauthenticating, password reset and change, two-factor
  methods, the data export, account deletion, and the appeal. A test walks every API and
  authentication route of the project with every writing method, so a new route cannot slip
  through; another test checks that the list names existing routes only.
- **Hidden profile:** `visible_profiles()` leaves out accounts with a suspension in force, so
  the public profile, its avatar and reporting the person answer 404 while it lasts.
- **Rules:** a message is required; the end must lie in the future; moderators cannot suspend
  themselves or an account with a platform role (an admin removes the role first, ADR 0018;
  both confirmed by the owner on 2026-11-15); one
  suspension in force per account. Suspending closes the person's open reports (reporters get the
  usual short email). The person is emailed when suspended, when it is lifted and when the appeal
  is decided.
- **API:** `POST /api/v1/moderation/cases/user/<id>/suspend/` (reason, message, `ends_at` or
  null); `POST /api/v1/moderation/account-suspensions/<id>/lift/`;
  `POST …/<id>/appeal/<uphold|lift>/`; `GET …/account-suspensions/appeals/` (moderators);
  `GET /api/v1/moderation/account-suspensions/` (**admins only**, with who suspended, lifted and
  decided); `GET /api/v1/me/suspension/` and `POST /api/v1/me/suspension/appeal/` for the person.
- **Audit:** suspended, lifted, appealed and decided are audit events with the moderator as actor
  and the person as subject (no IP addresses, question T).
- **Data export:** the person's suspensions with reason, message, end, lifting and appeal,
  without moderators' names.
- **Frontend:** a notice on every page for the suspended person (the root loader asks
  `/me/suspension/` next to the session); a refused write leads to the explanation on the account
  page (one place in `backendFetch`); the account page shows reason, message, end and the appeal
  form; the case page of a person offers suspending (date or permanently, confirmation), lifting
  and the appeal decision; the queue lists appeals against suspensions; admins see all
  suspensions on `/moderation/suspensions`.

## Alternatives

- A check in every view or permission class: easy to forget for a new route; the guard is one
  place and the route walk makes gaps visible.
- Deactivating the account (`is_active = False`): the person could no longer sign in, export or
  delete the account, contrary to the owner's decision.
- A second moderator for permanent suspensions or for appeals: rejected by the owner for now (one
  moderator at the start); the admins' list and the audit log keep the actions reviewable.

## Consequences

- One extra query for writing requests of signed-in people and one for each page of signed-in
  people (the notice).
- Content of a suspended person stays as it is (projects, campaigns, feedback); moderators block
  it separately if needed (ADR 0020).
- Pending invitations stay but cannot be accepted while the account is suspended.
- A suspended moderator cannot moderate (every write is refused); admins remove the role first.
