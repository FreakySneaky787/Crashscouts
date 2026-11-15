"""Generated test data at beta scale for performance measurements (WP 8.6, docs/PERFORMANCE.md).

Owner's target (2026-11-15): about 1,000 accounts, 2,000 projects and 5,000 campaigns. Everything is
generated: no real people, usernames start with "load-", email addresses end in ".invalid".

Safety:
- the command refuses to run on a database with accounts that it did not create itself, so it
  cannot mix test data into a real platform (``--allow-existing`` only for local test stacks);
- only ``--testers`` accounts get a password: a random one generated now and written to the
  ``--credentials`` file (never printed); all other accounts cannot sign in.
"""

import json
import random
import secrets
from datetime import timedelta
from pathlib import Path

from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.campaigns import status
from apps.campaigns.models import Campaign, Participation
from apps.catalog.models import Category, License, Platform, SoftwareType
from apps.feedback.models import Feedback
from apps.moderation.models import Report
from apps.profiles.models import Profile
from apps.projects.models import Membership, Project

PREFIX = "load-"
WORDS = [
    *("sync", "notes", "photo", "garden", "rail", "weather", "budget", "map", "chess", "audio"),
    *("paint", "shell", "backup", "chat", "reader", "timer", "forge", "pixel", "cloud", "orbit"),
    *("atlas", "harbor", "beacon", "lantern", "compass", "quill"),
]


def _sentence(rng: random.Random, words: int) -> str:
    return " ".join(rng.choice(WORDS) for _ in range(words)).capitalize() + "."


class Command(BaseCommand):
    help = "Generate test data at beta scale for performance measurements (never on real data)."

    def add_arguments(self, parser):
        parser.add_argument("--accounts", type=int, default=1000)
        parser.add_argument("--projects", type=int, default=2000)
        parser.add_argument("--campaigns", type=int, default=5000)
        parser.add_argument("--testers", type=int, default=20, help="accounts that can sign in")
        parser.add_argument("--credentials", type=Path, help="JSON file for the testers' logins")
        parser.add_argument(
            "--targets", type=Path, help="JSON file with public pages for the load test"
        )
        parser.add_argument("--seed", type=int, default=2026)
        parser.add_argument(
            "--allow-existing",
            action="store_true",
            help="local test stacks only: allow other accounts in the database",
        )

    def handle(self, *args, **opts):
        User = get_user_model()
        foreign = User.objects.exclude(username__startswith=PREFIX)
        if foreign.exists() and not opts["allow_existing"]:
            raise CommandError(
                "Refusing: the database has accounts this command did not create (real data?)."
            )
        if User.objects.filter(username__startswith=PREFIX).exists():
            raise CommandError("Test data already exists; start from an empty database.")
        if opts["testers"] and not opts["credentials"]:
            raise CommandError("--credentials is required to store the testers' passwords.")
        # Reproducible test data, not security: a seeded generator is intended here.
        rng = random.Random(opts["seed"])  # noqa: S311
        with transaction.atomic():
            logins = self._seed(rng, opts)
        if opts["credentials"]:
            opts["credentials"].write_text(json.dumps(logins, indent=2))
        if opts["targets"]:
            opts["targets"].write_text(json.dumps(self._targets(rng), indent=2))
        self.stdout.write(self.style.SUCCESS(self._summary()))

    def _seed(self, rng: random.Random, opts) -> list[dict]:
        User = get_user_model()
        now = timezone.now()
        users = [
            User(
                username=f"{PREFIX}{i:05d}",
                email=f"{PREFIX}{i:05d}@example.invalid",
                age_confirmed_at=now,
            )
            for i in range(opts["accounts"])
        ]
        logins = []
        for index, user in enumerate(users):
            if index < opts["testers"]:
                password = secrets.token_urlsafe(18)
                user.set_password(password)
                logins.append({"email": user.email, "password": password})
            else:
                user.set_unusable_password()
        users = User.objects.bulk_create(users, batch_size=500)
        EmailAddress.objects.bulk_create(
            [EmailAddress(user=u, email=u.email, verified=True, primary=True) for u in users],
            batch_size=500,
        )
        Profile.objects.bulk_create([Profile(user=u) for u in users], batch_size=500)

        licenses = list(License.objects.all())
        osi = [lic for lic in licenses if lic.is_osi_approved] or licenses
        categories = list(Category.objects.all())
        platforms = list(Platform.objects.all())
        types = list(SoftwareType.objects.all())
        projects = []
        for i in range(opts["projects"]):
            created = now - timedelta(days=rng.randint(0, 400))
            projects.append(
                Project(
                    slug=f"{PREFIX}p{i:05d}",
                    name=f"{rng.choice(WORDS).title()} {rng.choice(WORDS).title()} {i}",
                    summary=_sentence(rng, 8),
                    description=" ".join(_sentence(rng, 12) for _ in range(6)),
                    status=rng.choice([s for s, _ in Project.Status.choices]),
                    visibility="public" if rng.random() < 0.9 else "private",
                    license=rng.choice(osi if rng.random() < 0.8 else licenses),
                    created_at=created,
                    updated_at=created,
                )
            )
        projects = Project.objects.bulk_create(projects, batch_size=500)
        owners = {}
        memberships = []
        for project in projects:
            owner = rng.choice(users)
            owners[project.pk] = owner
            memberships.append(Membership(project=project, user=owner, role=Membership.Role.OWNER))
        Membership.objects.bulk_create(memberships, batch_size=500)
        self._link(Project.categories.through, projects, "category", categories, rng)
        self._link(Project.platforms.through, projects, "platform", platforms, rng)
        self._link(Project.software_types.through, projects, "softwaretype", types, rng)

        states = [status.PUBLISHED] * 5 + [status.COMPLETED] * 2 + [status.DRAFT] * 2
        states += [status.CANCELLED]
        campaigns = []
        for i in range(opts["campaigns"]):
            project = rng.choice(projects)
            state = rng.choice(states)
            starts = now - timedelta(days=rng.randint(-20, 120))
            published = state != status.DRAFT
            visibility = "public" if rng.random() < 0.7 else "private"
            campaigns.append(
                Campaign(
                    project=project,
                    slug=f"{PREFIX}c{i:05d}",
                    title=f"Beta {rng.choice(WORDS)} {i}",
                    summary=_sentence(rng, 8),
                    description=" ".join(_sentence(rng, 12) for _ in range(4)),
                    version=f"{rng.randint(0, 5)}.{rng.randint(0, 20)}.0",
                    starts_at=starts,
                    ends_at=starts + timedelta(days=rng.randint(7, 60)),
                    target_testers=rng.randint(5, 50),
                    visibility=visibility,
                    # The database requires invitations for private campaigns.
                    participation="direct" if visibility == "public" else "invitation",
                    state=state,
                    published_at=starts - timedelta(days=1) if published else None,
                    published_by=owners[project.pk] if published else None,
                    completed_at=now if state == status.COMPLETED else None,
                    cancelled_at=now if state == status.CANCELLED else None,
                )
            )
        campaigns = Campaign.objects.bulk_create(campaigns, batch_size=500)

        participations, feedback = [], []
        live = [c for c in campaigns if c.state in (status.PUBLISHED, status.COMPLETED)]
        for campaign in live:
            for tester in rng.sample(users, rng.randint(0, 6)):
                joined = campaign.published_at + timedelta(hours=rng.randint(1, 200))
                participations.append(
                    Participation(campaign=campaign, user=tester, created_at=joined)
                )
                for _ in range(rng.randint(0, 2)):
                    feedback.append(
                        Feedback(
                            campaign=campaign,
                            author=tester,
                            kind=rng.choice([k for k, _ in Feedback.Kind.choices]),
                            title=_sentence(rng, 5),
                            description=" ".join(_sentence(rng, 10) for _ in range(3)),
                            status=rng.choice([s for s, _ in Feedback.Status.choices]),
                        )
                    )
        Participation.objects.bulk_create(participations, batch_size=1000)
        Feedback.objects.bulk_create(feedback, batch_size=1000)

        reports = []
        for project in rng.sample(projects, min(300, len(projects))):
            reports.append(
                Report(
                    target_type=Report.TargetType.PROJECT,
                    project=project,
                    target_label=f"{project.name} (/p/{project.slug})",
                    reporter=rng.choice(users),
                    reason=rng.choice([r for r, _ in Report.Reason.choices]),
                )
            )
        Report.objects.bulk_create(reports, batch_size=500)
        return logins

    @staticmethod
    def _link(through, projects, field: str, items: list, rng: random.Random) -> None:
        if not items:
            return
        rows = []
        for project in projects:
            for item in rng.sample(items, min(len(items), rng.randint(0, 3))):
                rows.append(through(project_id=project.pk, **{f"{field}_id": item.pk}))
        through.objects.bulk_create(rows, batch_size=1000, ignore_conflicts=True)

    @staticmethod
    def _targets(rng: random.Random, size: int = 300) -> dict[str, list[str]]:
        """Pages anyone may open (loadtest/locustfile.py): public projects, live public
        campaigns of public projects, and profiles."""
        projects = list(
            Project.objects.filter(slug__startswith=PREFIX, visibility="public").values_list(
                "slug", flat=True
            )
        )
        campaigns = [
            f"{project}/c/{campaign}"
            for project, campaign in Campaign.objects.filter(
                slug__startswith=PREFIX,
                visibility="public",
                state=status.PUBLISHED,
                project__visibility="public",
            ).values_list("project__slug", "slug")
        ]
        users = list(
            get_user_model()
            .objects.filter(username__startswith=PREFIX)
            .values_list("username", flat=True)
        )
        pages = {"projects": projects, "campaigns": campaigns, "profiles": users}
        return {
            name: sorted(rng.sample(items, min(size, len(items)))) for name, items in pages.items()
        }

    def _summary(self) -> str:
        counts = {
            "accounts": get_user_model().objects.filter(username__startswith=PREFIX).count(),
            "projects": Project.objects.filter(slug__startswith=PREFIX).count(),
            "campaigns": Campaign.objects.filter(slug__startswith=PREFIX).count(),
            "participations": Participation.objects.filter(
                user__username__startswith=PREFIX
            ).count(),
            "feedback": Feedback.objects.filter(author__username__startswith=PREFIX).count(),
            "reports": Report.objects.filter(reporter__username__startswith=PREFIX).count(),
        }
        return "Generated: " + ", ".join(f"{n} {name}" for name, n in counts.items())
