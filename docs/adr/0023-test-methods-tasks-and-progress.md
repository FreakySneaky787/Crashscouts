# 0023 – Test methods, tasks and progress

- Status: Accepted
- Date: 2026-11-14

## Context

Phase 4 of the MVP plan: test tasks for the free, structured and combined testing methods
(master prompt 2.3), progress per participation with the statuses Not Started, In Progress,
Completed and Blocked (master prompt 3.6), and an overview for the team. Until now a campaign had
only the free-text field `methodology`.

The project owner decided (2026-11-13):

1. The method is a **fixed choice**. Free means no tasks; structured and combined need at least one
   task before publishing (or submitting for review); combined means tasks plus free testing. The
   free-text field stays as a hint.
2. Tasks **stay editable after publishing**. New tasks start as Not Started for everyone; a task
   with reported progress is **hidden instead of deleted**.
3. A status can carry an **optional short note** (at most 1000 characters), seen only by the team
   and the person.
4. Progress **stays when someone leaves or is removed** (marked for the team), continues when they
   come back, and is deleted with the account.

## Decision

- **Model:** `Campaign.method` (`free`, `structured`, `combined`; default `free`, so existing
  campaigns stay valid). `TestTask` (title up to 120 characters, Markdown instructions up to 4000,
  expected result up to 1000, position, `hidden_at`; at most 30 visible tasks per campaign).
  `TaskProgress` per participation and task (unique), with status and note; no row means
  Not Started. Progress hangs on the `Participation`, whose row is kept on leaving and reactivated
  on return, so decision 4 needs no extra logic; it is deleted with the account (CASCADE).
- **Rules:** `method` is frozen after publishing like visibility and participation; switching to
  free is refused while tasks exist (`tasks_exist`); publishing or submitting a structured or
  combined campaign without a visible task is refused (`tasks_required`); once a campaign is no
  longer a draft its last visible task cannot be removed (`last_task`); tasks of free campaigns are
  refused (`free_method_has_no_tasks`). Closed (completed, cancelled) and blocked campaigns are
  read-only.
- **Reporting progress:** only active participants of a published, unblocked campaign, for visible
  tasks, also before the start date. Throttled per account (`task_progress`, 300 per hour).
- **Visibility:** tasks are part of the campaign description: everyone who may see the campaign
  reads them. Progress and notes: the person sees their own (`my_status`, `my_note` in
  `…/tasks/`); the team sees everyone's in `…/progress/`, which is a plain 404 for everyone else,
  moderators included. Former participants appear there only with reported progress; accounts in
  the deletion grace period are not listed.
- **Review:** tasks are text like the description, so changes trigger no new review (owner's
  decision for WP 3B.4), but moderators see the method and all tasks in the review queue.
- **API:** `GET/POST …/tasks/`, `PATCH/DELETE …/tasks/<id>/` (delete answers `{"hidden": bool}`),
  `POST …/tasks/<id>/move/` (`up`/`down`), `PUT …/tasks/<id>/progress/`, `GET …/progress/`.
- No emails about progress in phase 4; the team reads the overview.

## Alternatives

- Deriving the method from whether tasks exist: no difference between structured and combined
  (rejected by the owner).
- Freezing tasks after publishing: teams could not fix mistakes (rejected by the owner).
- Deleting progress when someone leaves: the team would lose reported results (rejected by the
  owner).

## Consequences

- Notes are personal content kept until the account is deleted; they are in the data export.
- Detailed findings belong to feedback (phase 5); a note only explains a status.
- Hidden tasks keep their progress for the team's overview but are gone for testers.
