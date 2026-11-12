# MASTER PROMPT – SOFTWARE TESTING COMMUNITY PLATFORM
## Initial Project Planning, Product Strategy, Cloud Development & Technical Architecture

> **English translation.** The authoritative original is the German version
> [`MASTER-PROMPT.de.md`](MASTER-PROMPT.de.md); if the two differ, the German original applies.
>
> Archived brief with which the planning phase started on 2026-11-12. Deviations and refinements
> decided afterwards are recorded in [`PRD.md`](PRD.md), [`MVP-PLAN.md`](MVP-PLAN.md) and the ADRs
> under [`adr/`](adr/). Where they conflict, the newer, explicitly approved decisions apply.

**IMPORTANT: This prompt starts the first planning phase of the entire project. You are initially in Claude Code's Plan Mode.**

You shall first fully understand, examine, question and plan the existing project.

You shall not start any implementation yet.

You take on the role of a technical co-founder, software architect, product manager, senior full-stack developer, security engineer and technical project lead.

Your goal is to guide me systematically from a product idea to a professional, working open-source platform.

---

# 1. PROJECT IDENTITY

## 1.1 Provisional project name

The name used so far is **TestHub**.

IMPORTANT: TestHub is exclusively a provisional variable name and not a final product name.

The final name will be decided by me at a later point.

You may:
- Use TestHub as the internal project designation.
- Use the placeholder name temporarily in technical documentation.
- Prepare the technical architecture for a later name change.

You may NOT:
- Treat the name as a final brand.
- Decide a final name on your own.
- Create a final logo or corporate design.
- Register domains or social media presences under this name.
- Use the name as the final product identity without my consent.

The project name shall later be replaceable centrally.

## 1.2 Product vision

The project is a social platform for software developers and volunteer software testers.

The platform connects people who develop software with people who want to try new software and help improve it.

The fundamental problem:

Many open-source developers and independent software developers have difficulty finding enough external testers.

They develop software, test it on their own devices and publish new versions. In doing so, they often do not know whether their application also works on other systems, with other hardware or under other usage conditions.

At the same time, there are many people who:
- Want to try new software.
- Want to test beta versions.
- Discover and report bugs.
- Want to help developers.
- Want to get to know new open-source projects.
- Want to be part of a technical community.

These two groups shall come together.

**The central idea: developers shall be able to find testers, and testers shall be able to discover interesting software.**

The platform is a combination of:
1. A social network.
2. An open-source project directory.
3. A beta testing platform.
4. A feedback and bug reporting system.
5. A community for software development and software testing.

It shall feel like a modern social network and not like classic enterprise management software.

## 1.3 Product promise

For developers:
- Find new testers.
- Present software.
- Have beta versions tested.
- Collect feedback.
- Detect bugs.
- Build a community.

For testers:
- Discover new software.
- Voluntarily take part in test campaigns.
- Report bugs.
- Submit improvement suggestions.
- Try new technologies.
- Receive recognition for helpful contributions.

For the community:
- Make open-source projects more visible.
- Foster collaboration.
- Improve software quality.
- Connect developers and users directly.

Guiding idea:

**Test software together. Make it better together.**

---

# 2. BINDING PRODUCT DECISIONS

These decisions have already been made. Do not change them on your own.

## 2.1 Open-source first

Open-source projects are at the center.

- Open-source projects shall be particularly visible.
- Small projects shall also be discoverable.
- The platform itself will be open source.
- Commercial and closed-source projects may also take part.
- Other projects must be clearly labeled.

## 2.2 Visibility of test campaigns

There are two modes.

**Public campaigns:**
- Publicly visible.
- Findable in the Discover area.
- Can be shown in the public feed.
- Participation directly or after approval.

**Private campaigns:**
- Not publicly visible.
- Accessible only to invited people.
- Not visible in Discover or public feeds.
- Private content, files and discussions are protected.

## 2.3 Testing methods

The platform supports:

**Free testing:** freely trying out the software with general feedback.

**Structured testing:** developers provide concrete tasks.

**Combined testing:** a combination of both methods.

## 2.4 Platform structure

- One central community platform.
- No federation in the MVP.
- Self-hosting not in the MVP.
- The architecture shall allow later extensions.

## 2.5 Voluntariness

Participation is voluntary and free of charge.

No mandatory memberships, subscriptions or payments.

No monetization through selling personal user data.

## 2.6 License

AGPL-3.0 is the preferred license.

Review the license choice critically later, before it is finally published.

---

# 3. FEATURE SCOPE

The following description is the existing product basis.

You shall review it, structure it and examine it for completeness.

Do not invent additional product requirements without asking me first.

## 3.1 User accounts and profiles

- Registration.
- Email verification.
- Login and logout.
- Password reset.
- Username and profile picture.
- Biography.
- Interests.
- Preferred operating systems.
- Technical skills.
- Privacy settings.
- Public activities.
- Followers.

A user can be tester and developer at the same time.

## 3.2 Home – social feed

- New projects.
- New test campaigns.
- New releases.
- Project updates.
- Discussions.
- Community activities.
- Interesting test results.
- Personalized recommendations.
- Chronological view.

Small open-source projects must not be fundamentally crowded out by popular projects.

## 3.3 Discover

Filter options:

- Operating system.
- Category.
- Programming language.
- Software type.
- License.
- Development status.
- Active test campaigns.

Examples:

Linux, Windows, macOS, Android, Web, Desktop, CLI, Gaming and Developer Tools.

## 3.4 Projects

Every project has its own project page.

Possible information:

- Name.
- Description.
- Logo.
- Screenshots.
- Category.
- Operating systems.
- Programming languages.
- License.
- Repository link.
- Releases.
- Project status.
- Maintainers.
- Test campaigns.
- Discussions.
- Feedback.

Status values:

- Development.
- Alpha.
- Beta.
- Stable.
- Archived.

## 3.5 Test campaigns

Developers can create campaigns with the following information:

- Title and description.
- Associated project.
- Software version.
- Changelog.
- Test period.
- Desired number of testers.
- Target operating systems.
- Hardware requirements.
- Prerequisites.
- Testing methodology.
- Test tasks.
- Download links.

Status values:

- Draft.
- Open.
- Full.
- In Progress.
- Completed.
- Cancelled.

Participation:

- Direct participation.
- Participation after approval.
- Private invitations.

## 3.6 Test tasks

Developers can define tasks.

Examples:
- Install the software.
- Start the application.
- Import a file.
- Test a specific function.
- Change settings.
- Export data.
- Document the result.

Status:

- Not Started.
- In Progress.
- Completed.
- Blocked.

## 3.7 Feedback

Feedback types:

- Bug Report.
- UX Feedback.
- Feature Suggestion.
- Compatibility Report.
- General Feedback.

Bug reports can contain:

- Title.
- Description.
- Reproduction steps.
- Expected behavior.
- Actual behavior.
- Operating system.
- Software version.
- Screenshots.
- Logs.

Feedback status:

- New.
- Reviewed.
- Confirmed.
- In Progress.
- Fixed.
- Verified.
- Duplicate.
- Cannot Reproduce.
- Rejected.

Private feedback reports remain private by default.

## 3.8 Community

- Comments.
- Replies.
- Discussions.
- Following.
- Project updates.
- Notifications.
- Community activities.

## 3.9 Reputation

Possible later awards:

- Helpful Tester.
- Reliable Tester.
- Compatibility Expert.
- Early Contributor.
- Community Helper.

Quality is more important than the mere number of contributions.

## 3.10 Moderation

- Report users.
- Report projects.
- Report campaigns.
- Report comments.
- Remove spam.
- Warnings.
- Account suspensions.
- Moderation logs.

Private content must not be accessible to all moderators across the board.

---

# 4. PRODUCT BOUNDARIES

Initially, the platform shall NOT:

- Replace GitHub.
- Replace GitLab.
- Replace Codeberg.
- Be a CI/CD system.
- Automatically execute third-party software.
- Be a software download portal.
- Be a paid crowdtesting agency.
- Be a general developer forum.

The focus is on brokering and organizing human software testing.

---

# 5. CLOUD DEVELOPMENT ENVIRONMENT

**This requirement is binding. Development shall primarily take place in the cloud.**

I want to be able to work on the project entirely in the browser from different locations and devices.

I do not want to depend on my private computer or a locally installed development environment.

## 5.1 Desired infrastructure

The intended solution:

- GitHub as the central version control.
- A GitHub repository as the permanent source of the project.
- GitHub Codespaces as the cloud development environment.
- The VS Code web interface in the browser.
- Claude Code directly in the Codespace.
- Docker for the development environment.
- PostgreSQL as the project database.

Development is browser-based.

No local VS Code installation is required.

## 5.2 Examine the existing repository

First examine:
- Which repository is open.
- Which Git branch is active.
- Whether files already exist.
- Whether the Codespace environment is set up correctly.
- Which tools are already installed.
- Which Python, Node.js and Git versions are present.
- Which resources are available.
- Whether dev container configurations exist.

Do not create a new environment if a suitable environment already exists.

## 5.3 Cloud persistence

The project files are located in the persistent repository directory of the Codespace.

Important rules:

- Version changes regularly with Git.
- Push changes to GitHub.
- Do not store important files outside the project directory.
- Do not store credentials in Git files.
- Use GitHub Codespaces secrets when secret credentials are needed.
- Reuse the existing Codespace across devices where possible.
- Do not create a new independent development state for every device.

The GitHub remote is the permanent and authoritative source of the source code.

A Codespace alone is not a backup. Unpushed changes must never be considered permanently saved.

## 5.4 Development environment

The proposed technology stack:

| Area | Technology |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Build | Vite |
| Backend | Python |
| Backend framework | Django |
| API | Django REST Framework |
| Database | PostgreSQL |
| Cache | Redis, if needed |
| Background jobs | Celery, if needed |
| Container | Docker |
| Deployment | Docker Compose |

Develop the application as a modular monolith.

Microservices are not intended for the MVP.

Check current stable versions and official documentation at the time of implementation.

## 5.5 Dev container

A reproducible `.devcontainer/devcontainer.json` shall describe the development environment in the long term.

Possible contents:

- Development image.
- Python.
- Node.js.
- Git.
- Docker support.
- Necessary tools.
- Port configuration.
- Setup scripts.

**In the current planning phase you may not create or change this file.**

First examine the existing environment and present a concrete configuration as a proposal.

I must approve it before it is implemented.

## 5.6 Ports and security

During development, for example, the following ports may be used:

- Frontend: 5173.
- Backend: 8000.
- PostgreSQL: 5432.

Check the actual configuration.

Web server ports may initially only be reachable privately via Codespaces.

The database must not be exposed publicly.

## 5.7 Development environment and production operation

The cloud development environment is not the later production hosting.

Plan these systems separately.

The production platform shall later be operable independently of the Codespace.

---

# 6. PROJECT STRUCTURE AND DOCUMENTATION

The final structure has not been decided yet.

A possible structure:

```text
project/
├── .devcontainer/
├── .claude/
├── docs/
│   ├── MASTER-PROMPT.md
│   ├── PRD.md
│   ├── MVP-PLAN.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── DECISIONS.md
│   ├── OPEN-QUESTIONS.md
│   ├── ROADMAP.md
│   └── STATUS.md
├── frontend/
├── backend/
├── tests/
├── CLAUDE.md
├── README.md
├── CONTRIBUTING.md
└── docker-compose.yml
```

This is only a proposal.

First examine whether another structure is more suitable.

In the long term, the documentation shall serve the following purposes:

- Record the product vision.
- Document product requirements.
- Manage the development plan.
- Make architecture decisions traceable.
- Record open questions.
- Document the actual development state.
- Describe the development environment.
- Make collaboration easier.

The current prompt may later be stored in the repository as `MASTER-PROMPT.md`.

Document architecture decisions in ADRs.

The documentation must match the actual implementation.

---

# 7. SECURITY AND PRIVACY

Security must be considered from the start.

In particular:

- Secure password storage.
- HTTPS.
- CSRF protection.
- XSS protection.
- SQL injection protection.
- Rate limiting.
- Secure session management.
- Server-side authorization checks.
- Secure file uploads.
- Audit logs.
- Backup and recovery.
- Secure private campaigns.
- Privacy-compliant handling of tester information.

In the MVP, downloads go through official project sources.

TestHub shall not host executable programs or automatically execute third-party software.

Permitted feedback attachments shall initially be limited to necessary file formats:

- PNG.
- JPEG.
- WebP.
- TXT.
- LOG.
- JSON.

Protection requirements:
- No unauthorized access to private campaigns.
- No publication of private feedback reports without approval.
- No disclosure of user data.
- No secrets in the repository.

Take the Swiss FADP (DSG) and, where applicable, the European GDPR into account.

---

# 8. UI/UX DIRECTION

The platform shall look like a modern social network.

Desired properties:

- Professional.
- Modern.
- Clear.
- Responsive.
- Dark mode.
- Light mode.
- Consistent components.
- Good readability.
- Sensible information hierarchy.
- Subtle animations.
- Intuitive operation.

Main navigation as a proposal:

- Home.
- Discover.
- Testing.
- Projects.
- Activity.
- Community.
- Profile.

Do not simply copy the design of Reddit, GitHub or Discord.

Develop an independent design direction.

**Important:** If details of the visual design or user behavior are still unclear, ask me first before committing to a binding design.

---

# 9. MVP DEVELOPMENT STRATEGY

Development proceeds step by step.

The planned phases:

### Phase 0 – Foundation
- Repository.
- Development environment.
- Frontend.
- Backend.
- Database.
- Documentation.
- Test environment.

### Phase 1 – Accounts
- Registration.
- Email verification.
- Login.
- Profiles.
- Privacy settings.

### Phase 2 – Projects
- Create projects.
- Project pages.
- Maintainers.
- Repository links.
- Categories.
- Operating systems.

### Phase 3 – Discover and feed
- Home feed.
- Discover.
- Search.
- Filters.
- Following.

### Phase 4 – Campaigns
- Test campaigns.
- Public and private campaigns.
- Invitations.
- Participation management.

### Phase 5 – Testing
- Free testing.
- Structured tasks.
- Combined tests.

### Phase 6 – Feedback
- Bug reports.
- UX feedback.
- Feature suggestions.
- Compatibility reports.
- Attachments.
- Feedback status.

### Phase 7 – Community
- Comments.
- Discussions.
- Project updates.
- Notifications.

### Phase 8 – Moderation and security
- Reporting function.
- Moderation.
- Account suspensions.
- Audit logs.
- Security reviews.

### Phase 9 – Release
- Integration tests.
- Performance.
- Accessibility.
- Documentation.
- Closed beta.
- Public MVP.

Do not skip any phase without a justification and my consent.

---

# 10. YOUR BINDING WAY OF WORKING

This is one of the most important requirements.

You shall work critically, systematically and independently.

At the same time, I keep control over important decisions.

## 10.1 ALWAYS ASK WHEN DETAILS ARE UNCLEAR

If relevant information has not been clearly defined, you must ask me first.

No independent assumptions about open requirements.

This applies in particular to:

- Product features.
- UI/UX behavior.
- Design decisions.
- User flows.
- Permissions.
- Database behavior.
- Privacy.
- Security.
- API behavior.
- Integrations.
- Architecture changes.
- Technologies.
- Project scope.
- Naming and branding.

The procedure is:

1. Recognize which information is missing.
2. Explain why it is needed.
3. Ask a concrete question.
4. Bundle related questions.
5. Wait for my answer.
6. Only then refine the dependent planning or start implementation.

**Do not guess. Do not decide silently. Do not implement on the basis of unclear requirements.**

Product decisions that have already been made bindingly need not be asked again.

Routine decisions that are clearly determined by approved requirements and established project conventions may be made traceably.

If a technical decision has a significant impact on cost, security, data structure or later extensibility, you must clarify it with me beforehand.

## 10.2 Question critically

Do not agree with my proposals automatically.

Check:
- Is the feature actually useful?
- Is it already solved sufficiently?
- Do better technologies exist?
- Does unnecessary complexity arise?
- Is the solution secure?
- Does it fit the open-source concept?
- Is it really necessary for the MVP?

If you recognize improvements, present them as a proposal.

Important changes require my consent.

## 10.3 Step-by-step development

Every development task requires:

- Goal.
- Requirements.
- Affected components.
- Technical implementation.
- Dependencies.
- Acceptance criteria.
- Tests.
- Definition of done.

Work in verifiable work packages.

Do not write large parts of the application in an uncontrolled way.

## 10.4 Tests

Test every relevant feature.

Distinguish between:
- Unit tests.
- API tests.
- Integration tests.
- End-to-end tests.
- Security checks.

Never claim that a test succeeded without actually having run it.

## 10.5 Documentation

Document:
- Architecture decisions.
- Changes.
- API contracts.
- Database changes.
- Open problems.
- Security decisions.
- Development status.

The documentation must stay current.

## 10.6 Communication

Explain technical decisions in an understandable way.

I want to know:
- What is being developed?
- Why?
- How does it work?
- Which alternatives exist?
- What are the disadvantages?
- Which decision do I have to make?

For unclear requirements, ask concrete, understandable and preferably bundled questions.

---

# 11. CURRENT PLAN MODE ASSIGNMENT

**You are initially in Claude Code Plan Mode. This first session serves exclusively for inventory, clarification and planning.**

Plan the following procedure.

## Step 1 – Examine the environment

Examine read-only:

- Current repository.
- Git status.
- Current branch.
- Existing files.
- Directory structure.
- Codespace configuration.
- Existing `.devcontainer` files.
- Installed development tools.
- Python version.
- Node.js version.
- Git version.
- Available resources.
- Existing documentation.
- Existing Claude configuration.

Also examine whether the repository already contains project content.

Do not change anything.

## Step 2 – Analyze the project requirements

Examine the entire product vision and identify:

- Requirements that are already clarified.
- Missing requirements.
- Contradictions.
- Technical risks.
- Product decisions that are still missing.
- Security questions.
- Architecture questions.
- Dependencies between features.

Clearly separate binding requirements from your own proposals.

## Step 3 – Technical research

If internet access is available:

- Check current stable versions of the technology stack.
- Use official documentation wherever possible.
- Examine suitable alternatives.
- Check the integration of Claude Code into GitHub Codespaces.
- Check suitable dev container configurations.
- Identify technical risks.

Do not invent version numbers or compatibility statements.

## Step 4 – Prepare the architecture

Create a proposal for:

- System architecture.
- Frontend structure.
- Backend structure.
- Modules.
- Database model.
- ER diagram.
- API structure.
- Permission model.
- Cloud development environment.
- Dev container.
- Development workflow.
- Tests.
- Deployment.

Make sure the architecture fits the MVP and is not unnecessarily complex.

## Step 5 – Ask open questions

Ask me all important questions that are still open.

For example:
- How exactly should certain user flows work?
- Which details of the feed system are desired?
- How should tester assignment work?
- How should project owners be managed?
- Which information should be publicly visible?
- Which requirements apply to notifications?
- How should different campaigns be configured?

These questions are only examples. Ask only the questions you actually recognize as necessary after the inventory.

Bundle related questions and explain their respective impact.

Wait for my answers.

## Step 6 – Create the complete development plan

Only after the important questions have been clarified, create a complete plan with:

1. Finalized product requirements specification.
2. Technical architecture.
3. Database model.
4. API concept.
5. Permission model.
6. Cloud development environment.
7. Project structure.
8. Dev container configuration.
9. Detailed MVP plan.
10. Development tasks.
11. Test strategy.
12. Security concept.
13. Acceptance criteria.

## Step 7 – Wait for approval

Present the complete plan.

Point out open items and risks.

**Do not start the implementation before I have explicitly approved the plan.**

Even after approval, the obligation to ask first about new unclear product details remains.

---

# 12. ABSOLUTE RESTRICTIONS FOR THE FIRST SESSION

During this first planning phase:

- Do not create files.
- Do not edit files.
- Do not delete files.
- Do not install dependencies.
- Do not change the dev container configuration.
- Do not create or migrate a database.
- Do not create Git commits.
- Do not perform Git pushes.
- Do not change GitHub settings.
- Do not create or change secrets.
- Do not set up production services.
- Do not start the implementation.
- Do not make final design decisions.
- Do not make a final naming decision.

You may read existing files and analyze the environment.

If information could only be obtained through a change or installation, ask me first.

Present all results of the first session in the conversation first.

Only after my approval may documents or technical configurations be created or changed in the repository.

---

# 13. LONG-TERM VISION

In the long term, the platform shall be more than a simple beta download area.

Possible extensions:

- GitHub integration.
- GitLab integration.
- Forgejo and Codeberg integration.
- Tester matching.
- Extended reputation.
- Several testing phases.
- Release comparisons.
- Test statistics.
- Public API.
- Self-hosting.
- Federation.
- Mobile apps.

These features are not part of the first MVP.

Focus on the core product.

---

# 14. FINAL INSTRUCTION

Treat the project as a serious, long-term open-source product.

You shall not produce as much code as possible.

You shall enable a high-quality, secure, maintainable and genuinely useful platform.

Work systematically, critically and within the requirements I have approved.

I want to make the important decisions myself and at the same time benefit from your technical expertise.

The most important rule is:

**If a relevant requirement, detail or decision is unclear, always ask me first before making dependent changes.**

The final product name remains open.

The first session is intended exclusively for analysis and planning.

**Now start with step 1: examine the current GitHub Codespace repository and the available development environment in Plan Mode. Do not change anything. Then identify open questions and ask them before you create the final development plan.**
