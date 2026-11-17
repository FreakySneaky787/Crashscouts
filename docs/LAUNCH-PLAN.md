# Launch plan

> Decided with the owner on 2026-11-17. A plan, not a promise: each stage starts only when the
> previous stage reached its goal. Updated after every stage.

## Decisions of the owner (2026-11-17)

| Topic | Decision |
|---|---|
| Goal for the first 6 weeks | **Small but alive:** 20 published campaigns, 80 % of them with a first tester within 48 hours, 50 active testers |
| Order | **Stages** (below), not one big launch day |
| First audience | **Open-source and indie developers**, English, international |
| Owner's part | **5–10 hours per week, public under the owner's name**; 4–6 hours present on the public launch day |
| Existing accounts | GitHub, Reddit (karma from other subreddits, not active), Bluesky, X, developer Discord servers. No Hacker News or Mastodon account yet |
| Developers known personally | Hardly any, so the first projects are found in communities (stage 1) |

## Why this order

- **Crashscouts is a two-sided platform.** A developer who gets no tester does not come back; a
  tester who finds no campaign does not either. Andrew Chen advises focusing on the side that is
  harder to win and building one small network that "feels alive" before scaling (secondary
  sources: [Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-to-kickstart-and-scale-a-marketplace),
  [Stripe Atlas](https://stripe.com/guides/atlas/andrew-chen-marketplaces); the book *The Cold
  Start Problem* is the original).
- **Testers are the harder side here.** Developers looking for testers are easy to find; whole
  subreddits consist of their requests. Volunteer testers are scarce.
- **Show HN needs something to try.** Sign-up pages and landing pages are not allowed; trying
  should need as few barriers as possible ([Show HN rules](https://news.ycombinator.com/showhn.html)).
  Discover must therefore show real, running campaigns to visitors without an account.
- **Measured with the platform's own metrics** ([METRICS.md](METRICS.md)): Time to First Tester,
  Campaign Completion Rate, Useful Feedback Rate, Returning Testers. No tracking is added for the
  launch.

## Stage 0 – Preparation (now until the beta start)

**Product (blocking):**

- [ ] WP 8.7: repository public, with a README that shows what Crashscouts is (screenshots), how
      to run it, and the AGPL licence.
- [ ] Legal texts reviewed (question Y); `LEGAL_TEXTS_REVIEWED=true`.
- [ ] WP 8.8: open registration and `PUBLIC_CAMPAIGNS_ENABLED` switched on by the owner after
      the gate checklist. **Without the flag, Discover is empty for visitors.**
- [x] WP 8.9 launch appearance: logo, icon, home page for visitors, link previews ([ADR 0035](adr/0035-brand-and-home-page.md)).
- [ ] Crashscouts itself is the first campaign ("test Crashscouts"), so Discover is never empty.

**Accounts (start now; communities trust accounts with a history):**

- [ ] Create a Hacker News account; read and comment helpfully a few times a week. No
      promotion.
- [ ] Reddit: become active in r/opensource, r/SideProject and r/alphaandbetausers. Most useful:
      **test other people's projects and give real feedback**. This builds karma and contacts,
      and the people helped are the first candidates for stage 1. Read each subreddit's rules
      first; they differ and are stricter than Reddit's own.
- [ ] Bluesky and X: a short "building in public" post per week (what was built, what was
      learned, a screenshot).
- [ ] Mastodon (optional, strong open-source audience): choose a server with open sign-up;
      fosstodon.org is invite-only ([Fosstodon Hub](https://hub.fosstodon.org/were-invite-only)).
- [ ] Discord: in the developer servers you belong to, read the rules on self-promotion and
      find the channels meant for showing projects or asking for feedback.

**Operations (before stage 3):**

- [ ] Email: Scaleway's Essential plan includes 300 emails per month
      ([Scaleway docs](https://www.scaleway.com/en/docs/transactional-email/how-to/manage-tem-plans/));
      third-party listings name €0.25 per further 1,000 (not confirmed on Scaleway's page).
      Check the billing method so verification emails keep working on a busy day.
- [ ] Load: the server was tested with 20 concurrent users ([PERFORMANCE.md](PERFORMANCE.md)).
      A post on a large front page can bring far more visitors at once. Proposal: a second load
      test of the public pages (Discover, campaign page) with more users before stage 3.
- [ ] Moderation: the owner is the only moderator. Plan a daily look at the moderation queue
      during stages 2 and 3.

## Stage 1 – Soft launch: the first 20 projects (weeks 1–2 after the beta start)

- **Where:** developers who are currently asking for testers:
  - posts in r/alphaandbetausers and r/SideProject;
  - "feedback wanted" or "help wanted" in small open-source projects on GitHub;
  - project channels on the Discord servers.
- **How:**
  - one personal message per developer (template below), never mass messages;
  - **give first:** test their project for 15 minutes and write real feedback, then invite.
- **Ask each developer to bring 2–3 testers** from their own users (link to their campaign).
  This is the fastest way to the tester side.
- **Goal:** 20 published campaigns. Look after each one personally: does the first tester come,
  is the feedback useful, what is unclear?

## Stage 2 – Testers (weeks 2–4)

- Posts for testers, not developers: "Help open-source projects by testing them" on Reddit
  (r/alphaandbetausers and suitable subreddits, after reading the rules), Bluesky, X and the
  Discord servers.
- The owner tests too; every campaign without a tester after 24 hours gets a personal look.
- **Goal:** 50 active testers; 80 % of the campaigns get their first tester within 48 hours
  (Time to First Tester on the statistics page).

## Stage 3 – Public launch (weeks 4–6, only after stage 2's goal)

- Show HN with a short, plain text (draft at stage 2): what it is, why, what is special (AGPL,
  no tracking, structured feedback), what does not work yet. Then r/opensource, r/SideProject,
  Bluesky, X, Mastodon, and an article on dev.to ("what I learned building …").
- **Launch day:**
  - the owner is present for 4–6 hours and answers every comment, honestly, including
    criticism;
  - watch Healthchecks.io, the moderation queue and the sign-ups;
  - no voting rings: never ask anyone to upvote (forbidden on HN and Reddit).
- After the launch: a short write-up of what happened and what changes.

## Template: invitation to a developer (stage 1)

> Hi {name}, I tried {project} after your post in {place}. {One concrete observation, for
> example a bug or something that confused me.}
>
> I'm building Crashscouts, an open-source (AGPL) platform where developers find volunteer
> testers and get structured feedback: test tasks, bug reports, no tracking. It's in an early
> beta, and I'm looking for the first 20 projects. Would you like to put {project} on it? It
> takes about 10 minutes, and I'll be one of your first testers.
>
> {link} – no pressure, and thanks for building {project}.

Rules for the template: always personal, never copied unchanged; at most one follow-up; respect
"no".

## Risks

| Risk | Counter-measure |
|---|---|
| Discover looks empty | Stage 1 before any public post; Crashscouts' own campaign |
| Developers get no testers and leave | Owner tests personally; each developer brings 2–3 testers |
| Posts count as spam | Read each community's rules; give before asking; one post per community |
| Too many visitors at once | Second load test before stage 3; Healthchecks.io alerts |
| Spam accounts after open registration | Existing protections (confirmed email, rate limits, reports, suspensions); daily moderation |
| The owner's time | Stages can wait; no stage starts before the previous goal is met |
