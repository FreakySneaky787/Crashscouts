# Phase 8 – Release (closed beta): plan and decisions

> State: 2026-11-15. Nothing of phase 8 is implemented before the decisions it needs. Sources for
> prices are the providers' official pages, fetched on 2026-11-15; prices change, so they are
> checked again before any contract.

## Work packages

| WP | Content | Waiting for |
|---|---|---|
| 8.1 | Hosting and production setup: server in CH/EU, PostgreSQL 18, file storage, reverse proxy with TLS 1.2/1.3, jobs (rate-limit purge, deletions), SSR behind the proxy (question P) | ✅ **live since 2026-11-16 at https://crashscouts.org** (registration closed); set-up, checks, job timers and updates in [OPERATIONS.md](OPERATIONS.md) |
| 8.2 | Email in production (question F: Scaleway decided), sending domain `crashscouts.org` with SPF, DKIM, DMARC | ✅ **done 2026-11-16:** Scaleway Transactional Email, domain verified (SPF, DKIM, DMARC), test email in the inbox; [OPERATIONS.md](OPERATIONS.md) §12 |
| 8.3 | Encrypted off-site backups of the database and files; a **tested** restore with written steps | ✅ **done 2026-11-16** ([ADR 0033](adr/0033-backups.md)): restic to Infomaniak Swiss Backup, 7 days, nightly timer; restore test passed on the server |
| 8.4 | Monitoring and logs: health checks, error notifications, log retention without personal data | ✅ done 2026-11-17 ([ADR 0034](adr/0034-monitoring.md)): Healthchecks.io, error emails without personal data, logs 7 days; set up and alarm-tested on the server; open: the 7-day deletion check on 2026-11-25 |
| 8.5 | Legal texts: privacy policy, terms of use, imprint; AGPL source link in the footer | **drafted 2026-11-15** ([ADR 0031](adr/0031-legal-texts.md)); open: the `[TO DECIDE]` points (question Y) and the professional review |
| 8.6 | Integration, performance (load test of Discover, search, rate-limit cache) and accessibility pass | ✅ done 2026-11-15: part A (production-like stack, smoke tests, question P, [ADR 0032](adr/0032-production-setup.md)), part B (performance, [PERFORMANCE.md](PERFORMANCE.md)), part C (accessibility, [ACCESSIBILITY.md](ACCESSIBILITY.md); the owner's screen reader check with Orca and TalkBack is open) |
| 8.7 | Making the repository public: **DCO** (G) and **Contributor Covenant** (J) decided 2026-11-15, GitHub's free security features, README | the date |
| – | Launch plan in stages ([LAUNCH-PLAN.md](LAUNCH-PLAN.md), decided 2026-11-17) | – |
| 8.9 | Launch appearance: logo, icons, heading font, home page for visitors, link previews, folded Discover filters | ✅ done 2026-11-17 ([ADR 0035](adr/0035-brand-and-home-page.md)) |
| 8.8 | Beta start: open registration (decided), gate checklist ticked, the owner switches `PUBLIC_CAMPAIGNS_ENABLED` | everything above |

## Decisions of the owner (2026-11-15)

- **Hosting:** check the prices on the providers' own pages first (done below); decide afterwards.
- **Name and domain first:** no test server before the final name and domain are decided (K) –
  decided the same day: Crashscouts, crashscouts.org.
  This also holds back the real GitHub test (U) and the email sending domain (8.2).
- **Beta access: open registration.** Everyone can sign up; production sets
  `DJANGO_SIGNUP_ENABLED=true` for the beta. The existing protections apply: confirmed email,
  rate limits, reporting, blocking and account suspensions, the review of public campaigns.
  *Note:* the beta is "closed" only in name then; moderation load grows with every sign-up.
- **Legal texts:** Claude drafts them from the documented data processing (FADP and GDPR); a
  professional reviews them before the beta. Not legal advice.

## Hosting comparison (official pages, fetched 2026-11-15)

Self-managed virtual servers for Django, the SSR server and PostgreSQL on one machine.

| Provider | Plan | vCPU / RAM / disk | Price | Location | Notes |
|---|---|---|---|---|---|
| Infomaniak | VPS Lite | 2 / 4 GB / 60 GB | CHF 7.20 per month | Switzerland | annual commitment, paid for 12 months at once; no snapshots, no availability guarantee, 500 Mbit/s, unlimited traffic, outgoing port 25 blocked |
| Infomaniak | VPS Lite | 4 / 4 GB / 80 GB | CHF 9.00 per month | Switzerland | as above |
| Hetzner | Cloud CX23 | 2 / 4 GB / 40 GB | € 5.99 per month excl. VAT | Nuremberg, Helsinki | billed by the hour; 20 TB traffic; backups from € 1.098 per month; the cost-optimized plans showed **"currently unavailable"** on the day |
| Hetzner | Cloud CX33 | 4 / 8 GB / 80 GB | € 8.99 per month excl. VAT | as above | as above |
| Scaleway | DEV1-M | 3 / 4 GB / – | about € 14.74 per month before tax | (not read) | billed by the hour |
| Exoscale | Standard Medium | 2 / 4 GB / 10–400 GB | (not shown) | Swiss and EU zones | the page loads its prices by script; no figures in the page itself |

Sources: [Infomaniak VPS Lite](https://www.infomaniak.com/en/hosting/vps-lite) ·
[Hetzner Cloud cost-optimized](https://www.hetzner.com/cloud/cost-optimized/) ·
[Scaleway virtual instances](https://www.scaleway.com/en/pricing/virtual-instances/) ·
[Exoscale pricing](https://www.exoscale.com/pricing/)

**Assessment (proposal, not a decision):**

- **Infomaniak VPS Lite 2 vCPU / 4 GB:** best fit for data in Switzerland at a very low price,
  but there are three trade-offs:
  - the annual commitment;
  - no snapshots, so backups must be our own (8.3, which is needed anyway);
  - port 25 is blocked. This does not matter: email goes through Scaleway's submission service
    (F), not through port 25.
- **Hetzner:** cheapest per month and billed by the hour, but the data is in Germany or Finland,
  and the cost-optimized plans were not orderable on the day.
- **Scaleway and Exoscale:** more expensive for the same size, or with no prices readable.

## Name and domain: decided 2026-11-15

**"Crashscouts", main address `crashscouts.org`** (owner's decision). On the day of the decision
`crashscouts.org`, `.com` and `.ch` were all unregistered (RDAP: 404). Next steps for the owner:
register at least the `.org` domain (preferably `.com` and `.ch` as well, so nobody else takes
them) and have a trademark search done (Swissreg, EUIPO). The name is switched centrally in
`brand.ts` and `PLATFORM_NAME`; the repository was renamed to `FreakySneaky787/Crashscouts`.

## Name and domain: proposals (question K, history)

Checked on 2026-11-15:
- **Domains:** looked up in the registries' official RDAP services. "free" means not
  registered on that day, nothing more. The check was validated with known registered domains,
  which all answered "taken".
- **Names:** a web search for products with the same name.

Not done: a trademark search (Swissreg, EUIPO TMview); that is needed before deciding, and none
of this is legal advice.

| Name | Idea | .com | .org | .ch | .dev | Same-name products found |
|---|---|---|---|---|---|---|
| **Testfellows** | testers and developers as fellows; friendly, international | free | free | free | free | none |
| **Bugcommons** | open-source "commons" for finding bugs together | free | free | free | free | not searched |
| **Openbetahub** | says what it is: open betas in one place | free | free | free | free | not searched; "OpenBeta" is an existing climbing project |
| **Betaharbor** | a safe harbour for betas | taken | free | free | free | none |
| **Betaroots** | grassroots betas, open source | taken | free | free | free | none |
| **Testerling** | small, friendly tester | free | free | free | free | close to "Testling" (browser testing) and "TesterLink" (an Android tester platform): risk of confusion |
| Betabench, Tryouthub, Fieldtests | descriptive | taken | free | free | free | not searched |
| Proofcamp, Testgarden | | taken | partly taken | free | partly taken | not searched |

**Proposal:** **Testfellows** (all four endings free, no same-name product found), with
`testfellows.org` as the main address (fits a non-commercial open-source project) and `.ch` and
`.com` registered alongside. Second choice: **Bugcommons**. The name stays configurable in one
place (`frontend/app/config/brand.ts`, `PLATFORM_NAME`).

Sources: RDAP services of [Verisign (.com)](https://rdap.verisign.com/com/v1/),
[Public Interest Registry (.org)](https://rdap.publicinterestregistry.org/rdap/),
[SWITCH (.ch)](https://rdap.nic.ch/), [Google Registry (.dev)](https://pubapi.registry.google/rdap/);
name searches: web search on 2026-11-15 (no hits for "Testfellows", "Betaharbor" and "Betaroots";
for "Testerling" the similar [Testling](https://stackshare.io/testling) and
[TesterLink](https://www.producthunt.com/products/testerlink)).

### Second round (2026-11-15, the owner asked for different names)

The direction is shorter, more distinctive names instead of "test/beta + word". The domains
were checked in the RDAP services as above (.com, .org, .ch).

| Name | Idea | .com | .org | .ch | Same-name products found |
|---|---|---|---|---|---|
| **Nightlyclub** | "nightly" builds are what developers hand to early testers; "club" is the community | free | free | free | none for software; may remind of nightlife |
| **Crashscouts** | scouts who go ahead and find the crashes | free | free | free | none (only crash investigation and insurance topics) |
| **Releasecrew** | the crew that gets a release ready | taken | free | free | none |
| Betascouts | testers as scouts | free | free | free | **"BetaScout" exists** (an Android beta-testing app): too close |
| Pilotrun, Maidenrun | a first run before the real launch | taken | free | free | not searched |
| Openscouts | open-source scouts | taken | free | free | "Open Scouts" exists (SourceForge) |
| Scoutlab, Vorlauf, Testli | | taken | partly taken | taken | – |

Sources: RDAP as above; web searches on 2026-11-15 (no hits for "Nightlyclub" or "Releasecrew"
as software; [BetaScout on AlternativeTo](https://alternativeto.net/software/betascout/about/);
[Open Scouts on SourceForge](https://sourceforge.net/projects/open-scouts.mirror/)).
