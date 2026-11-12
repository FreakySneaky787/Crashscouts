"""Profiles: privacy by default, visibility rules and editing (decision D)."""

import pytest
from allauth.account.models import EmailAddress
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.accounts.tests.conftest import new_password
from apps.profiles.models import Profile

User = get_user_model()


def make_user(username: str, *, verified: bool = True, active: bool = True):
    user = User.objects.create_user(
        username=username, email=f"{username}@example.test", password=new_password()
    )
    user.is_active = active
    user.save()
    EmailAddress.objects.create(user=user, email=user.email, verified=verified, primary=True)
    return user


def logged_in(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def alice(db):
    return make_user("alice")


def fill_everything(user) -> None:
    response = logged_in(user).patch(
        "/api/v1/me/profile/",
        {
            "bio": "I test sync tools on old laptops.",
            "link": "https://example.test/alice",
            "interests": ["developer-tools", "productivity"],
            "platforms": ["linux", "android"],
            "skills": ["bug-reporting"],
        },
        format="json",
    )
    assert response.status_code == 200, response.content


def test_every_new_user_gets_a_profile(alice):
    assert Profile.objects.filter(user=alice).exists()


def test_new_profile_shows_only_username_and_avatar(alice):
    fill_everything(alice)

    data = APIClient().get("/api/v1/profiles/alice/").json()

    assert data == {"username": "alice", "avatar_key": None, "indexable": False}


def test_fields_appear_only_when_switched_on(alice):
    fill_everything(alice)
    logged_in(alice).patch(
        "/api/v1/me/profile/", {"show_bio": True, "show_platforms": True}, format="json"
    )

    data = APIClient().get("/api/v1/profiles/alice/").json()

    assert data["bio"] == "I test sync tools on old laptops."
    assert [item["slug"] for item in data["platforms"]] == ["linux", "android"]
    for hidden in ("link", "interests", "skills"):
        assert hidden not in data
    assert "example.test/alice" not in str(data)


def test_profile_lookup_ignores_case(alice):
    assert APIClient().get("/api/v1/profiles/Alice/").status_code == 200


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("username", "kwargs"),
    [("unconfirmed", {"verified": False}), ("deactivated", {"active": False})],
)
def test_unconfirmed_and_deactivated_profiles_are_404(username, kwargs):
    make_user(username, **kwargs)
    assert APIClient().get(f"/api/v1/profiles/{username}/").status_code == 404


@pytest.mark.django_db
def test_unknown_profile_is_404():
    assert APIClient().get("/api/v1/profiles/nobody-here/").status_code == 404


@pytest.mark.django_db
def test_own_profile_requires_login():
    client = APIClient()
    assert client.get("/api/v1/me/profile/").status_code == 403
    assert client.patch("/api/v1/me/profile/", {"bio": "x"}, format="json").status_code == 403


def test_users_can_only_edit_their_own_profile(alice):
    bob = make_user("bob")
    logged_in(bob).patch("/api/v1/me/profile/", {"bio": "Bob's bio"}, format="json")

    alice.profile.refresh_from_db()
    assert alice.profile.bio == ""
    assert Profile.objects.get(user=bob).bio == "Bob's bio"


def test_own_profile_returns_everything_including_switches(alice):
    fill_everything(alice)
    data = logged_in(alice).get("/api/v1/me/profile/").json()
    assert data["link"] == "https://example.test/alice"
    assert data["interests"] == ["developer-tools", "productivity"]
    assert data["show_bio"] is False
    assert data["indexable"] is False


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"bio": "x" * 501}, "bio"),
        ({"link": "http://example.test"}, "link"),
        ({"link": "javascript:alert(1)"}, "link"),
        ({"link": "ftp://example.test/file"}, "link"),
        ({"interests": ["not-a-category"]}, "interests"),
        ({"platforms": ["windows", "plan9"]}, "platforms"),
    ],
)
def test_invalid_profile_input_is_rejected(alice, payload, field):
    response = logged_in(alice).patch("/api/v1/me/profile/", payload, format="json")
    assert response.status_code == 400
    assert field in response.json()


def test_read_only_fields_cannot_be_changed(alice):
    bob = make_user("bob")
    logged_in(alice).patch(
        "/api/v1/me/profile/",
        {"username": "bob", "avatar_key": "00000000-0000-4000-8000-000000000000", "user": bob.pk},
        format="json",
    )
    alice.refresh_from_db()
    assert alice.username == "alice"
    assert alice.profile.avatar_key is None


@pytest.mark.django_db
def test_catalog_lists_are_public_and_seeded():
    data = APIClient().get("/api/v1/catalog/").json()
    assert {"linux", "windows", "android"} <= {item["slug"] for item in data["platforms"]}
    assert data["categories"]
    assert data["skills"]
