"""Project logo and screenshots (WP 2.4): team-only upload, visibility-checked delivery."""

import io

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.projects.images import LOGO_PREFIX, SCREENSHOT_PREFIX
from apps.projects.models import Screenshot

from .test_projects import client_for, make_user, new_project


def png(size=(640, 480)) -> SimpleUploadedFile:
    output = io.BytesIO()
    Image.new("RGB", size, (14, 103, 103)).save(output, format="PNG")
    return SimpleUploadedFile("shot.png", output.getvalue(), content_type="image/png")


@pytest.fixture
def setup(db):
    owner = make_user("img-owner")
    maintainer = make_user("img-maint")
    stranger = make_user("img-stranger")
    public = new_project(owner, "img-public", "public", [maintainer])
    private = new_project(owner, "img-private", "private", [maintainer])
    return {
        "owner": owner,
        "maintainer": maintainer,
        "stranger": stranger,
        "public": public,
        "private": private,
    }


def upload_logo(client, slug):
    return client.put(f"/api/v1/projects/{slug}/logo/", {"image": png()}, format="multipart")


def add_shot(client, slug, alt="Main window with the feed list", size=(640, 480)):
    return client.post(
        f"/api/v1/projects/{slug}/screenshots/",
        {"image": png(size), "alt_text": alt},
        format="multipart",
    )


def test_team_uploads_a_logo_that_everyone_sees_on_public_projects(setup):
    assert upload_logo(client_for(setup["maintainer"]), "img-public").status_code == 204
    key = client_for().get("/api/v1/projects/img-public/").json()["logo_key"]

    response = APIClient().get(f"/api/v1/project-images/{key}/", HTTP_ACCEPT="image/*")

    assert response.status_code == 200
    assert response["Content-Type"] == "image/webp"
    assert response["Cache-Control"] == "public, max-age=3600"
    assert response["X-Content-Type-Options"] == "nosniff"
    with Image.open(io.BytesIO(b"".join(response.streaming_content))) as image:
        assert image.size == (256, 256)


def test_images_of_private_projects_only_for_the_team(setup):
    add_shot(client_for(setup["owner"]), "img-private")
    key = Screenshot.objects.get(project=setup["private"]).key
    url = f"/api/v1/project-images/{key}/"

    assert APIClient().get(url).status_code == 404
    stranger = APIClient()
    stranger.force_login(setup["stranger"])
    assert stranger.get(url).status_code == 404
    member = APIClient()
    member.force_login(setup["maintainer"])
    response = member.get(url)
    assert response.status_code == 200
    assert response["Cache-Control"] == "private, no-store"


def test_outsiders_cannot_upload_or_delete(setup):
    for client in (client_for(setup["stranger"]), client_for()):
        assert upload_logo(client, "img-public").status_code in {403, 404}
        assert add_shot(client, "img-public").status_code in {403, 404}
    assert not Screenshot.objects.exists()
    add_shot(client_for(setup["owner"]), "img-public")
    key = Screenshot.objects.get().key
    assert (
        client_for(setup["stranger"])
        .delete(f"/api/v1/projects/img-public/screenshots/{key}/")
        .status_code
        == 404
    )
    assert Screenshot.objects.filter(key=key).exists()


def test_screenshots_need_a_description_and_are_limited(setup):
    client = client_for(setup["owner"])
    assert add_shot(client, "img-public", alt="").json() == {"code": "alt_text_required"}
    assert add_shot(client, "img-public", alt="x" * 201).json() == {"code": "alt_text_required"}
    for _ in range(Screenshot.MAX_PER_PROJECT):
        assert add_shot(client, "img-public", size=(64, 64)).status_code == 201
    assert add_shot(client, "img-public", size=(64, 64)).json() == {"code": "too_many_screenshots"}


def test_large_screenshots_are_scaled_down_keeping_the_aspect_ratio(setup):
    add_shot(client_for(setup["owner"]), "img-public", size=(3000, 1500))
    shot = client_for().get("/api/v1/projects/img-public/").json()["screenshots"][0]
    assert (shot["width"], shot["height"]) == (1600, 800)
    assert shot["alt_text"] == "Main window with the feed list"


def test_disguised_files_are_rejected(setup):
    fake = SimpleUploadedFile("evil.png", b"<svg onload=alert(1)>", content_type="image/png")
    response = client_for(setup["owner"]).post(
        "/api/v1/projects/img-public/screenshots/",
        {"image": fake, "alt_text": "Evil"},
        format="multipart",
    )
    assert response.json() == {"code": "invalid_image"}


def test_files_are_deleted_with_the_project(setup, django_capture_on_commit_callbacks):
    client = client_for(setup["owner"])
    with django_capture_on_commit_callbacks(execute=True):
        upload_logo(client, "img-public")
        add_shot(client, "img-public")
    setup["public"].refresh_from_db()
    logo_path = f"{LOGO_PREFIX}/{setup['public'].logo_key}.webp"
    shot_path = f"{SCREENSHOT_PREFIX}/{Screenshot.objects.get().key}.webp"
    assert default_storage.exists(logo_path)
    assert default_storage.exists(shot_path)

    with django_capture_on_commit_callbacks(execute=True):
        assert client.delete("/api/v1/projects/img-public/").status_code == 204

    assert not default_storage.exists(logo_path)
    assert not default_storage.exists(shot_path)
