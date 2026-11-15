# Accessibility (WP 8.6 part C)

> State on 2026-11-15. Target: **WCAG 2.2 level AA**. Automated checks run in every CI run; the
> screen reader check below is done by a person (the owner), because tools cannot judge it.

## What is checked automatically

| Check | Where | What it proves |
|---|---|---|
| axe (WCAG 2.0/2.1/2.2 A and AA rules) on **every page** at phone width (390 px), light and dark theme | `e2e/tests/a11y.spec.ts` | no rule violation found by axe; no horizontal scrolling (1.4.10 Reflow) |
| **Route inventory** | `e2e/tests/a11y.spec.ts` (last test) | every page of `frontend/app/routes.ts` has an axe check here or in a named spec, or is listed with a reason; a new page without a check fails CI |
| axe at desktop width (mostly light and dark) in the feature specs | 19 other specs (projects, campaigns, feedback, moderation, …) | the same rules in the states only those flows reach (2FA prompt, moderation case, download page, …) |
| **Keyboard only**: sign up, confirm, sign in; create and publish a campaign; invite and join; give feedback; report a project | `e2e/tests/keyboard.spec.ts` | 2.1.1 Keyboard and 2.1.2 No Keyboard Trap; at every focus stop a visible focus indicator (2.4.7) inside the viewport (2.4.11) |
| **Reduce motion** | `e2e/tests/display.spec.ts` | with the system setting, transitions are off (2.3.3); without it they run, so the check is not empty |
| **400 % zoom** (320 CSS px) and **200 % text** | `e2e/tests/display.spec.ts` | no horizontal scrolling, the page heading stays visible (1.4.10, 1.4.4) |

Pages without an automatic check, and why:

- `/signup/github` needs a sign-up started at GitHub; the tests never contact GitHub. It is part of
  the real GitHub test (open question U) and of the manual check below.
- `/probe/...` are test-only routes of the SSR spike and answer 404 in production.

## Results (2026-11-15)

- axe: **no violations** on any page at 390 px in light and dark; no page scrolls sideways at
  390 px or 320 px, or with 200 % text.
- Keyboard: all five core flows work without a mouse. **One finding, fixed:** date and time fields
  lost their focus ring on their last focus stop (the browser's calendar button inside the field),
  so a keyboard user could not see where the focus was. `base.css` now draws the ring while the
  focus is anywhere inside such a field; the keyboard test fails without the fix (checked).
- Not covered by tools: whether texts and announcements make sense when heard, the reading order
  as experienced, and the quality of alternative texts. That is the manual check below.

## Manual check with a screen reader (for the owner)

About 45 minutes. Best done on the beta server once it runs (WP 8.1), otherwise on a local start.
Use a test account, never your own data. Note every point that is unclear, wrong or missing in the
table at the end; "I did not understand where I was" is a finding too.

### Linux: Orca with Firefox

1. Install Orca from your distribution's packages if it is missing. In GNOME, **Super+Alt+S**
   turns Orca on and off ([GNOME help](https://help.gnome.org/gnome-help/a11y-screen-reader.html));
   on other desktops start it with the command `orca` and quit it the same way you started it
   ([Orca: controlling Orca](https://help.gnome.org/users/orca/stable/commands_controlling_orca.html.en)).
2. Keys used below ([Orca: structural navigation](https://help.gnome.org/users/orca/stable/commands_structural_navigation.html.en)):
   **H** next heading, **M** next landmark, **K** next link, **F** next form field, **Tab** next
   control; with Shift the previous one. **Alt+Shift+H** lists all headings.

### Android: TalkBack with Chrome

1. Settings → Accessibility → TalkBack → turn on "Use TalkBack". To turn it off again: same place;
   while TalkBack is on, tap once to select and double-tap to activate
   ([Google: turn off TalkBack](https://support.google.com/accessibility/android/answer/14252950?hl=en)).
2. Gestures ([Google: TalkBack gestures](https://support.google.com/accessibility/android/answer/6151827?hl=en)):
   **swipe right / left** next / previous item, **double-tap** activates the selected item; the
   TalkBack menu (swipe down then right) offers "Read from focused item".

### The three flows (do them with both screen readers)

**Flow 1 – Sign up and sign in**

- [ ] The page title is read when a page opens (e.g. "Create account · Crashscouts").
- [ ] The first link is "Skip to content"; it jumps to the main content.
- [ ] Every field is read with its label; required fields and the password rules are announced.
- [ ] Submit the form empty: the error is announced without searching for it, and each field says
      what is wrong.
- [ ] After signing up, "check your inbox" is read; after confirming, the sign-in page says the
      address is confirmed.
- [ ] The theme buttons say which theme is on ("pressed" / "selected").

**Flow 2 – Find a project and open a campaign**

- [ ] On Discover, **H** (Orca) or swiping (TalkBack) gives a sensible order: page heading, search,
      filters, results.
- [ ] The search field and every filter are read with their name; the number of results is
      announced or easy to find after searching.
- [ ] A result is read as a link with the project's name, not "link" or "more".
- [ ] On the project page the headings structure the page (name, campaigns, team, …); images have
      a meaningful description or are skipped as decoration.

**Flow 3 – Give feedback (as a tester of a campaign)**

- [ ] "Give feedback" is found as a link; the feedback types are read with their short explanation.
- [ ] In the bug report form, every field and its hint are read; the optional fields say so.
- [ ] After sending, "Thank you. Your feedback was sent." is announced.
- [ ] A form error (e.g. title missing) is announced and the focus or reading position leads to it.

**Also (once):** sign-up with GitHub (`/signup/github`), as soon as the real GitHub test (question
U) is possible.

### Findings

| Date | Screen reader and device | Flow and step | What happened | What you expected |
|---|---|---|---|---|
| | | | | |

Report the findings to the development; each one becomes a fix with a test where a tool can
check it.
