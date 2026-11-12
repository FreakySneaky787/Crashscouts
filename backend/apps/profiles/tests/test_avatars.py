"""Avatar upload pipeline: only re-encoded PNG/JPEG/WebP images, no metadata, safe delivery."""

import io
import os

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.profiles.avatars import avatar_path

from .test_profiles import logged_in, make_user

GPS_IFD = 0x8825


def image_bytes(fmt: str, size=(640, 480), *, with_gps: bool = False) -> bytes:
    image = Image.new("RGB", size, (14, 103, 103))
    output = io.BytesIO()
    kwargs = {}
    if with_gps:
        exif = Image.Exif()
        exif[0x010F] = "ExampleCam"  # Make
        exif.get_ifd(GPS_IFD).update({1: "N", 2: (47.0, 22.0, 0.0), 3: "E", 4: (8.0, 32.0, 0.0)})
        kwargs["exif"] = exif.tobytes()
    image.save(output, format=fmt, **kwargs)
    return output.getvalue()


def upload(client: APIClient, data: bytes, name: str, content_type: str):
    return client.put(
        "/api/v1/me/profile/avatar/",
        {"avatar": SimpleUploadedFile(name, data, content_type=content_type)},
        format="multipart",
    )


@pytest.fixture
def alice(db):
    return make_user("alice")


@pytest.mark.parametrize(
    ("fmt", "content_type"), [("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp")]
)
def test_valid_images_are_reencoded_as_256px_webp(alice, fmt, content_type):
    response = upload(logged_in(alice), image_bytes(fmt), f"a.{fmt.lower()}", content_type)

    assert response.status_code == 200, response.content
    key = response.json()["avatar_key"]
    with default_storage.open(avatar_path(key), "rb") as stored, Image.open(stored) as image:
        assert image.format == "WEBP"
        assert image.size == (256, 256)


def test_metadata_including_gps_is_removed(alice):
    original = image_bytes("JPEG", with_gps=True)
    with Image.open(io.BytesIO(original)) as check:
        assert check.getexif().get_ifd(GPS_IFD)  # the test image really carries GPS data

    key = upload(logged_in(alice), original, "photo.jpg", "image/jpeg").json()["avatar_key"]

    with default_storage.open(avatar_path(key), "rb") as stored:
        stored_bytes = stored.read()
    with Image.open(io.BytesIO(stored_bytes)) as image:
        assert not image.getexif()
        assert "exif" not in image.info
        assert "xmp" not in image.info
    assert b"ExampleCam" not in stored_bytes


@pytest.mark.parametrize(
    ("data", "name", "content_type"),
    [
        (
            b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
            "a.svg",
            "image/svg+xml",
        ),
        (b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', "a.png", "image/png"),
        (b"GIF89a" + b"\x00" * 64, "a.gif", "image/gif"),
        (b"GIF89a" + b"\x00" * 64, "a.png", "image/png"),
        (b"<html><script>alert(1)</script></html>", "a.png", "image/png"),
        (b"\x89PNG\r\n\x1a\n" + b"not really a png", "a.png", "image/png"),
        (b"", "a.png", "image/png"),
    ],
)
def test_non_images_and_disguised_files_are_rejected(alice, data, name, content_type):
    response = upload(logged_in(alice), data, name, content_type)

    assert response.status_code == 400, response.content
    alice.profile.refresh_from_db()
    assert alice.profile.avatar_key is None


def test_png_declared_as_text_is_rejected(alice):
    response = upload(logged_in(alice), image_bytes("PNG"), "a.png", "text/plain")
    assert response.status_code == 400


def test_oversized_file_is_rejected(alice):
    data = image_bytes("PNG") + os.urandom(2 * 1024 * 1024)  # trailing bytes beyond 2 MB
    response = upload(logged_in(alice), data, "big.png", "image/png")
    assert response.status_code in {400, 413}


def test_decompression_bomb_is_rejected_before_decoding(alice):
    # A tiny, highly compressible PNG that would decode to 10000 x 10000 pixels.
    bomb = image_bytes("PNG", size=(10_000, 10_000))
    assert len(bomb) < 2 * 1024 * 1024
    response = upload(logged_in(alice), bomb, "bomb.png", "image/png")
    assert response.status_code == 400


def test_anonymous_upload_is_refused(db):
    response = upload(APIClient(), image_bytes("PNG"), "a.png", "image/png")
    assert response.status_code == 403


def test_replacing_and_removing_the_avatar_deletes_old_files(
    alice, django_capture_on_commit_callbacks
):
    client = logged_in(alice)
    first = upload(client, image_bytes("PNG"), "a.png", "image/png").json()["avatar_key"]
    # Old files are deleted only after the database change has been committed.
    with django_capture_on_commit_callbacks(execute=True):
        second = upload(client, image_bytes("JPEG"), "b.jpg", "image/jpeg").json()["avatar_key"]

    assert first != second
    assert not default_storage.exists(avatar_path(first))
    assert default_storage.exists(avatar_path(second))

    with django_capture_on_commit_callbacks(execute=True):
        assert client.delete("/api/v1/me/profile/avatar/").json()["avatar_key"] is None
    assert not default_storage.exists(avatar_path(second))


def test_avatar_is_served_with_safe_headers(alice):
    key = upload(logged_in(alice), image_bytes("PNG"), "a.png", "image/png").json()["avatar_key"]

    # Browsers and the SSR server ask for images, not JSON.
    response = APIClient().get(f"/api/v1/avatars/{key}/", HTTP_ACCEPT="image/webp,image/*")

    assert response.status_code == 200
    assert response["Content-Type"] == "image/webp"
    assert response["X-Content-Type-Options"] == "nosniff"
    assert "sandbox" in response["Content-Security-Policy"]
    assert b"".join(response.streaming_content)[:4] == b"RIFF"
    assert APIClient().post(f"/api/v1/avatars/{key}/").status_code == 405


@pytest.mark.django_db
def test_avatars_of_hidden_accounts_and_unknown_keys_are_404():
    hidden = make_user("hidden")
    key = upload(logged_in(hidden), image_bytes("PNG"), "a.png", "image/png").json()["avatar_key"]
    hidden.is_active = False
    hidden.save()

    client = APIClient()
    assert client.get(f"/api/v1/avatars/{key}/").status_code == 404
    assert client.get("/api/v1/avatars/00000000-0000-4000-8000-000000000000/").status_code == 404
    assert client.get("/api/v1/avatars/../../etc/passwd/").status_code == 404


def test_uploads_are_rate_limited(alice):
    client = logged_in(alice)
    statuses = [
        upload(client, image_bytes("PNG", size=(64, 64)), "a.png", "image/png").status_code
        for _ in range(11)
    ]
    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429
