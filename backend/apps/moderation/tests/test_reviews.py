"""Review of public campaigns and links (WP 3B.4): nothing public goes live unreviewed."""

import pytest
from allauth.mfa.models import Authenticator
from django.core import mail

from apps.audit.models import AuditEvent
from apps.campaigns.models import Campaign, CampaignLink, Participation
from apps.campaigns.tests.test_campaigns import payload
from apps.projects.tests.test_projects import client_for, make_user, new_project

from .test_moderation import moderator

API = "/api/v1/projects/review-app/campaigns/"
BETA = f"{API}beta/"


def with_2fa(user):
    Authenticator.objects.create(user=user, type=Authenticator.Type.TOTP, data={"secret": "x"})
    return user


@pytest.fixture
def world(db, settings):
    settings.PUBLIC_CAMPAIGNS_ENABLED = True
    owner = with_2fa(make_user("rev-owner"))
    project = new_project(owner, "review-app", "public")
    client_for(owner).post(API, payload(slug="beta", visibility="public"), format="json")
    client_for(owner).post(
        f"{BETA}links/",
        {"label": "AppImage", "url": "https://downloads.example.org/app"},
        format="json",
    )
    return {
        "owner": owner,
        "project": project,
        "campaign": Campaign.objects.get(slug="beta"),
        "mod": moderator("rev-mod"),
        "visitor": make_user("rev-visitor"),
    }


def submit(world):
    return client_for(world["owner"]).post(f"{BETA}publish/")


def decide(world, kind, target, decision, message=""):
    url = f"/api/v1/moderation/reviews/{kind}/{target.pk}/{decision}/"
    return client_for(world["mod"]).post(url, {"message": message}, format="json")


def test_public_campaigns_wait_for_review(world):
    response = submit(world)
    assert response.json()["state"] == response.json()["status"] == "in_review"
    world["campaign"].refresh_from_db()
    assert world["campaign"].published_at is None  # not live yet
    assert world["campaign"].published_by == world["owner"]
    for user in (None, world["visitor"]):
        assert client_for(user).get(BETA).status_code == 404
    reviews = client_for(world["mod"]).get("/api/v1/moderation/reviews/").json()
    [entry] = reviews["campaigns"]
    assert entry["links"][0]["url"] == "https://downloads.example.org/app"
    assert AuditEvent.objects.filter(kind=AuditEvent.Kind.CAMPAIGN_SUBMITTED).exists()


def test_rule_a_two_factor_is_required_to_submit(world):
    maintainer = make_user("rev-maint")
    world["project"].memberships.create(user=maintainer, role="maintainer")
    response = client_for(maintainer).post(f"{BETA}publish/")
    assert response.json() == {"code": "needs_2fa"}
    world["campaign"].refresh_from_db()
    assert world["campaign"].state == "draft"


def test_approval_publishes_and_releases_the_links(world, django_capture_on_commit_callbacks):
    submit(world)
    with django_capture_on_commit_callbacks(execute=True):
        assert decide(world, "campaign", world["campaign"], "approve").status_code == 204
    world["campaign"].refresh_from_db()
    assert world["campaign"].state == "published"
    assert world["campaign"].published_at is not None
    assert client_for(world["visitor"]).get(BETA).status_code == 200
    assert CampaignLink.objects.get().review_status == "approved"
    assert any("Review result for Review-App" in m.subject for m in mail.outbox)


def test_rejection_returns_to_draft_with_the_reason(world):
    submit(world)
    assert decide(world, "campaign", world["campaign"], "reject").json() == {
        "code": "message_required"
    }
    assert (
        decide(
            world, "campaign", world["campaign"], "reject", "Add a real description."
        ).status_code
        == 204
    )
    body = client_for(world["owner"]).get(BETA).json()
    assert (body["state"], body["review_note"]) == ("draft", "Add a real description.")
    assert client_for(world["visitor"]).get(BETA).status_code == 404
    # Resubmitting clears the note.
    submit(world)
    assert client_for(world["owner"]).get(BETA).json()["review_note"] == ""


def test_the_team_cannot_publish_itself_or_change_access_in_review(world):
    submit(world)
    owner = client_for(world["owner"])
    assert owner.post(f"{BETA}publish/").json() == {"code": "invalid_transition"}
    assert owner.patch(BETA, {"visibility": "private"}, format="json").json() == {
        "code": "locked_after_publish"
    }
    assert owner.patch(BETA, {"title": "Better title"}, format="json").status_code == 200
    assert owner.post(f"{BETA}cancel/").json()["state"] == "cancelled"


def test_new_and_changed_links_wait_but_the_old_ones_stay(world):
    submit(world)
    decide(world, "campaign", world["campaign"], "approve")
    tester = make_user("rev-tester")
    Participation.objects.create(campaign=world["campaign"], user=tester)
    old = CampaignLink.objects.get()
    owner = client_for(world["owner"])
    new = owner.post(
        f"{BETA}links/",
        {"label": "Windows", "url": "https://downloads.example.org/app.exe"},
        format="json",
    ).json()
    assert new["review_status"] == "pending"
    listed = [link["label"] for link in client_for(tester).get(f"{BETA}links/").json()]
    assert listed == ["AppImage"]  # the waiting link reaches no one
    assert client_for(tester).get(f"{BETA}links/{new['id']}/").status_code == 404
    # A label change keeps the review, a new address does not.
    owner.patch(f"{BETA}links/{old.pk}/", {"label": "AppImage (x86_64)"}, format="json")
    old.refresh_from_db()
    assert old.review_status == "approved"
    owner.patch(f"{BETA}links/{old.pk}/", {"url": "https://evil.example.org/app"}, format="json")
    old.refresh_from_db()
    assert old.review_status == "pending"
    assert client_for(tester).get(f"{BETA}links/").json() == []

    reviews = client_for(world["mod"]).get("/api/v1/moderation/reviews/").json()
    assert {link["label"] for link in reviews["links"]} == {"Windows", "AppImage (x86_64)"}
    decide(world, "link", CampaignLink.objects.get(pk=new["id"]), "approve")
    decide(world, "link", old, "reject", "This address is not the project's.")
    labels = [link["label"] for link in client_for(tester).get(f"{BETA}links/").json()]
    assert labels == ["Windows"]
    old.refresh_from_db()
    assert (old.review_status, old.review_note) == (
        "rejected",
        "This address is not the project's.",
    )


def test_private_campaigns_need_no_review(world):
    owner = client_for(world["owner"])
    owner.post(API, payload(slug="private-one"), format="json")
    assert owner.post(f"{API}private-one/publish/").json()["state"] == "published"
    link = owner.post(
        f"{API}private-one/links/",
        {"label": "x", "url": "https://downloads.example.org/x"},
        format="json",
    ).json()
    assert link["review_status"] == "approved"


def test_only_moderators_review(world):
    submit(world)
    for user in (world["owner"], world["visitor"]):
        assert client_for(user).get("/api/v1/moderation/reviews/").status_code == 404
        url = f"/api/v1/moderation/reviews/campaign/{world['campaign'].pk}/approve/"
        assert client_for(user).post(url).status_code == 404
    world["campaign"].refresh_from_db()
    assert world["campaign"].state == "in_review"
    assert decide(world, "campaign", world["campaign"], "explode").status_code == 404
