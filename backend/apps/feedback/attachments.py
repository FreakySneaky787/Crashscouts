"""Feedback attachments (WP 5.2, ADR 0024; master prompt 4, docs/SECURITY.md section 5).

Allowlist: PNG, JPEG, WebP, TXT, LOG, JSON. Every upload is untrusted:
- Images go through the shared pipeline (apps/core/images.py): size limit, signature, Pillow
  format and pixel checks, then RE-ENCODED as WebP (longest side 2560 px) without metadata.
- Text files: the extension must be .txt, .log or .json; the content must be valid UTF-8 without
  NUL bytes; JSON must parse. They are stored as uploaded but only ever delivered as downloads
  (Content-Disposition: attachment, text/plain, nosniff), never rendered.
- Random keys, files outside the web root; deleted with their row, with the feedback and with the
  author's account (they may contain personal data; the text of the feedback stays, anonymised).
"""

import json
import re
import uuid
from pathlib import PurePath

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.db.models.signals import post_delete, pre_delete
from django.dispatch import receiver

from apps.core import images

from .models import FeedbackAttachment

PREFIX = "feedback-attachments"
IMAGE_MAX_BYTES = 5 * 1024 * 1024
TEXT_MAX_BYTES = 2 * 1024 * 1024
IMAGE_MAX_SIDE = 2560
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
TEXT_EXTENSIONS = {".txt", ".log", ".json"}
SAFE_NAME = re.compile(r"[^A-Za-z0-9._ -]+")


class AttachmentError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def display_name(raw: str, extension: str) -> str:
    """A harmless name for the download: letters, digits, dot, dash, underscore, space."""
    stem = SAFE_NAME.sub("_", PurePath(raw or "").stem).strip(" ._") or "attachment"
    return f"{stem[:80]}{extension}"


def path_of(attachment: FeedbackAttachment) -> str:
    extension = "webp" if attachment.kind == FeedbackAttachment.Kind.IMAGE else "txt"
    return f"{PREFIX}/{attachment.key}.{extension}"


def _checked_text(upload: UploadedFile, extension: str) -> bytes:
    if upload.size is None or upload.size == 0 or upload.size > TEXT_MAX_BYTES:
        raise AttachmentError("invalid_file")
    upload.seek(0)
    data = upload.read(TEXT_MAX_BYTES + 1)
    if len(data) > TEXT_MAX_BYTES:
        raise AttachmentError("invalid_file")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise AttachmentError("invalid_file") from exc
    if "\x00" in text:
        raise AttachmentError("invalid_file")
    if extension == ".json":
        try:
            json.loads(text)
        except ValueError as exc:
            raise AttachmentError("invalid_file") from exc
    return data


def process(upload: UploadedFile) -> tuple[str, bytes, str]:
    """Checks an upload; returns (kind, bytes to store, display name)."""
    extension = PurePath(upload.name or "").suffix.lower()
    if extension in IMAGE_EXTENSIONS:
        try:
            encoded = images.reencode(upload, max_bytes=IMAGE_MAX_BYTES, max_side=IMAGE_MAX_SIDE)
        except ValidationError as exc:
            raise AttachmentError("invalid_file") from exc
        return FeedbackAttachment.Kind.IMAGE, encoded.data, display_name(upload.name, ".webp")
    if extension in TEXT_EXTENSIONS:
        data = _checked_text(upload, extension)
        return FeedbackAttachment.Kind.TEXT, data, display_name(upload.name, extension)
    raise AttachmentError("invalid_file")


@transaction.atomic
def add_attachment(feedback, upload: UploadedFile) -> FeedbackAttachment:
    from .models import Feedback

    feedback = Feedback.objects.select_for_update(of=("self",)).get(pk=feedback.pk)
    if feedback.attachments.count() >= FeedbackAttachment.MAX_PER_FEEDBACK:
        raise AttachmentError("too_many_attachments")
    kind, data, name = process(upload)
    attachment = FeedbackAttachment(
        feedback=feedback, kind=kind, name=name, size=len(data), key=uuid.uuid4()
    )
    default_storage.save(path_of(attachment), ContentFile(data))
    attachment.save()
    return attachment


@receiver(post_delete, sender=FeedbackAttachment)
def _delete_file(sender, instance: FeedbackAttachment, **kwargs) -> None:
    path = path_of(instance)
    transaction.on_commit(lambda: default_storage.delete(path))


@receiver(pre_delete, sender=settings.AUTH_USER_MODEL)
def _delete_attachments_of_deleted_accounts(sender, instance, **kwargs) -> None:
    """Final account deletion: the feedback text stays (anonymised), the files go (ADR 0024)."""
    for attachment in FeedbackAttachment.objects.filter(feedback__author=instance):
        attachment.delete()
