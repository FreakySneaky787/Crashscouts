"""The generator for performance test data (WP 8.6): small run, refusal on real data, logins."""

import json

import pytest
from django.contrib.auth import authenticate, get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.campaigns.models import Campaign
from apps.projects.models import Project
from apps.projects.tests.test_projects import make_user


def seed(tmp_path, **extra):
    credentials = tmp_path / "logins.json"
    call_command(
        "seed_load_data",
        accounts=30,
        projects=20,
        campaigns=40,
        testers=3,
        credentials=credentials,
        **extra,
    )
    return json.loads(credentials.read_text())


@pytest.mark.django_db
def test_generates_test_data_with_working_tester_logins(tmp_path):
    logins = seed(tmp_path)
    assert get_user_model().objects.filter(username__startswith="load-").count() == 30
    assert Project.objects.count() == 20
    assert Campaign.objects.count() == 40
    assert all(p.memberships.filter(role="owner").count() == 1 for p in Project.objects.all())
    assert len(logins) == 3
    for login in logins:
        assert login["email"].endswith(".invalid")
        assert authenticate(email=login["email"], password=login["password"]) is not None
    others = (
        get_user_model()
        .objects.filter(username__startswith="load-")
        .exclude(email__in=[login["email"] for login in logins])
    )
    assert not any(user.has_usable_password() for user in others)


@pytest.mark.django_db
def test_refuses_a_database_with_real_accounts_and_a_second_run(tmp_path):
    make_user("a-real-person")
    with pytest.raises(CommandError, match="did not create"):
        seed(tmp_path)
    assert not Project.objects.exists()
    seed(tmp_path, allow_existing=True)
    with pytest.raises(CommandError, match="already exists"):
        seed(tmp_path, allow_existing=True)


@pytest.mark.django_db
def test_targets_are_only_pages_anyone_may_open(tmp_path):
    targets_file = tmp_path / "targets.json"
    seed(tmp_path, targets=targets_file)
    targets = json.loads(targets_file.read_text())
    assert all(targets[name] for name in ("projects", "campaigns", "profiles"))
    for slug in targets["projects"]:
        assert Project.objects.get(slug=slug).visibility == "public"
    for path in targets["campaigns"]:
        project, _, campaign = path.split("/")
        found = Campaign.objects.get(project__slug=project, slug=campaign)
        assert (found.visibility, found.state, found.project.visibility) == (
            "public",
            "published",
            "public",
        )
