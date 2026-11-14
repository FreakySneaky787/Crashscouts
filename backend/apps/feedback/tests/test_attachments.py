"""Feedback attachments (WP 5.2, ADR 0024): allowlist, re-encoding, text checks, limits, who may
see them, safe delivery and deletion with the feedback and the account."""

import io
import json
import os

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client
from PIL import Image

from apps.feedback.attachments import path_of
from apps.feedback.models import Feedback, FeedbackAttachment
from apps.profiles.tests.test_avatars import GPS_IFD, image_bytes
from apps.projects.tests.test_projects import client_for

from .test_feedback import set_status, url


def attach(user, feedback, data: bytes, name: str, content_type="application/octet-stream"):
    return client_for(user).post(
        url(feedback, "attachments/"),
        {"file": SimpleUploadedFile(name, data, content_type=content_type)},
        format="multipart",
    )


def browser(user):
    """Files are served by a plain Django view: it needs a real session, not DRF's
    force_authenticate."""
    client = Client()
    if user is not None:
        client.force_login(user)
    return client


def file_url(key) -> str:
    return f"/api/v1/feedback-attachments/{key}/"


def read(response) -> bytes:
    return b"".join(response.streaming_content)


@pytest.mark.parametrize(
    ("fmt", "name", "content_type"),
    [
        ("PNG", "a.png", "image/png"),
        ("JPEG", "a.jpg", "image/jpeg"),
        ("WEBP", "a.webp", "image/webp"),
    ],
)
def test_images_are_reencoded_without_metadata(world, fmt, name, content_type):
    response = attach(
        world["author"], world["feedback"], image_bytes(fmt, with_gps=True), name, content_type
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert (body["kind"], body["name"]) == ("image", "a.webp")
    served = browser(world["owner"]).get(file_url(body["key"]))
    assert served["Content-Type"] == "image/webp"
    assert served["Content-Disposition"].startswith("inline")
    with Image.open(io.BytesIO(read(served))) as image:
        assert image.format == "WEBP"
        assert not image.getexif().get_ifd(GPS_IFD)
        assert "exif" not in image.info


def test_large_images_are_scaled_down(world):
    data = image_bytes("PNG", size=(4000, 1000))
    key = attach(world["author"], world["feedback"], data, "wide.png", "image/png").json()["key"]
    with Image.open(io.BytesIO(read(browser(world["owner"]).get(file_url(key))))) as image:
        assert image.size == (2560, 640)


@pytest.mark.parametrize(
    ("data", "name"),
    [
        (b'{"level": "error", "message": "boom"}', "crash.json"),
        (b"2026-11-14 ERROR something failed\n", "app.log"),
        (b"<script>alert(1)</script> plain text, never rendered", "notes.txt"),
    ],
)
def test_text_files_are_delivered_only_as_downloads(world, data, name):
    response = attach(world["author"], world["feedback"], data, name, "text/plain")
    assert response.status_code == 201, response.content
    served = browser(world["author"]).get(file_url(response.json()["key"]))
    assert served["Content-Type"] == "text/plain; charset=utf-8"
    assert served["Content-Disposition"] == f'attachment; filename="{name}"'
    assert served["X-Content-Type-Options"] == "nosniff"
    assert served["Content-Security-Policy"] == "default-src 'none'; sandbox"
    assert served["Cache-Control"] == "private, no-store"
    assert read(served) == data


@pytest.mark.parametrize(
    ("data", "name", "content_type"),
    [
        (b'<svg onload="alert(1)"></svg>', "a.svg", "image/svg+xml"),
        (b"<html><script>alert(1)</script></html>", "a.png", "image/png"),  # disguised
        (b"MZ\x90\x00" + os.urandom(64), "tool.exe", "application/octet-stream"),
        (b"\x89PNG\r\n\x1a\n" + os.urandom(64), "binary.log", "text/plain"),  # binary as text
        ("café".encode("latin-1"), "latin1.txt", "text/plain"),  # not UTF-8
        (b"line\x00with nul", "nul.log", "text/plain"),
        (b'{"broken": ', "broken.json", "application/json"),
        (b"", "empty.txt", "text/plain"),
        (b"#!/bin/sh\nrm -rf /\n", "script.sh", "text/plain"),
        (b"plain", "noextension", "text/plain"),
    ],
)
def test_everything_else_is_refused(world, data, name, content_type):
    response = attach(world["author"], world["feedback"], data, name, content_type)
    assert response.status_code == 400, response.content
    assert response.json() == {"code": "invalid_file"}
    assert not FeedbackAttachment.objects.exists()


def test_size_limits_and_the_decompression_bomb(world):
    big_text = b"x" * (2 * 1024 * 1024 + 1)
    assert attach(world["author"], world["feedback"], big_text, "big.log").json() == {
        "code": "invalid_file"
    }
    huge = image_bytes("PNG") + os.urandom(6 * 1024 * 1024)
    assert attach(
        world["author"], world["feedback"], huge, "huge.png", "image/png"
    ).status_code in {
        400,
        413,
    }
    bomb = image_bytes("PNG", size=(10_000, 10_000))
    assert attach(world["author"], world["feedback"], bomb, "bomb.png", "image/png").json() == {
        "code": "invalid_file"
    }
    assert not FeedbackAttachment.objects.exists()


def test_at_most_five_files_and_names_are_cleaned(world):
    for n in range(5):
        response = attach(
            world["author"], world["feedback"], b"log line", f"../../etc/pa ss<{n}>.log"
        )
        assert response.status_code == 201
    assert response.json()["name"] == "pa ss_4.log"
    assert attach(world["author"], world["feedback"], b"one more", "six.log").json() == {
        "code": "too_many_attachments"
    }


def test_only_the_author_adds_and_removes_while_new(world):
    feedback = world["feedback"]
    key = attach(world["author"], feedback, b"log", "a.log").json()["key"]
    assert attach(world["other"], feedback, b"log", "b.log").status_code == 404
    assert attach(world["owner"], feedback, b"log", "b.log").status_code == 403
    assert (
        client_for(world["other"]).delete(url(feedback, f"attachments/{key}/")).status_code == 404
    )
    set_status(world, "owner", "reviewed")
    assert attach(world["author"], feedback, b"log", "late.log").json() == {
        "code": "feedback_locked"
    }
    assert client_for(world["author"]).delete(url(feedback, f"attachments/{key}/")).json() == {
        "code": "feedback_locked"
    }


@pytest.mark.parametrize("who", ["anonymous", "stranger", "other", "leaver", "mod"])
def test_attachments_are_only_for_the_team_and_the_author(world, who):
    feedback = world["feedback"]
    key = attach(world["author"], feedback, b"secret token=abc", "env.log").json()["key"]
    # Published feedback too: the text becomes public, the files never do.
    client_for(world["owner"]).post(url(feedback, "publish/propose/"))
    client_for(world["author"]).post(url(feedback, "publish/consent/"))
    client = client_for(None if who == "anonymous" else world[who])
    assert browser(None if who == "anonymous" else world[who]).get(file_url(key)).status_code == 404
    assert client.get(url(feedback)).json()["attachments"] == []
    for allowed in ("owner", "maintainer", "author"):
        assert browser(world[allowed]).get(file_url(key)).status_code == 200
        assert len(client_for(world[allowed]).get(url(feedback)).json()["attachments"]) == 1


def test_blocked_content_hides_attachments_from_the_author(world):
    key = attach(world["author"], world["feedback"], b"log", "a.log").json()["key"]
    world["campaign"].blocked_at = world["campaign"].updated_at
    world["campaign"].save()
    assert browser(world["author"]).get(file_url(key)).status_code == 404
    assert browser(world["owner"]).get(file_url(key)).status_code == 200


def test_files_go_with_the_attachment_the_feedback_and_the_account(
    world, django_capture_on_commit_callbacks
):
    author, feedback = world["author"], world["feedback"]
    with django_capture_on_commit_callbacks(execute=True):
        first = attach(author, feedback, b"one", "one.log").json()["key"]
        second = attach(author, feedback, image_bytes("PNG"), "shot.png", "image/png").json()["key"]
    paths = {key: path_of(FeedbackAttachment.objects.get(key=key)) for key in (first, second)}
    assert all(default_storage.exists(path) for path in paths.values())

    with django_capture_on_commit_callbacks(execute=True):
        client_for(author).delete(url(feedback, f"attachments/{first}/"))
    assert not default_storage.exists(paths[first])

    with django_capture_on_commit_callbacks(execute=True):
        author.delete()  # final account deletion
    assert not default_storage.exists(paths[second])
    assert Feedback.objects.get(pk=feedback.pk).author is None  # the text stays, anonymised


def test_withdrawing_feedback_deletes_its_files(world, django_capture_on_commit_callbacks):
    feedback = Feedback.objects.get(
        pk=client_for(world["author"])
        .post(
            "/api/v1/projects/fb-app/campaigns/beta/feedback/",
            {"kind": "general", "title": "Second", "description": "x"},
            format="json",
        )
        .json()["id"]
    )
    with django_capture_on_commit_callbacks(execute=True):
        key = attach(world["author"], feedback, json.dumps({"a": 1}).encode(), "a.json").json()[
            "key"
        ]
    path = path_of(FeedbackAttachment.objects.get(key=key))
    with django_capture_on_commit_callbacks(execute=True):
        assert client_for(world["author"]).delete(url(feedback)).status_code == 204
    assert not default_storage.exists(path)
