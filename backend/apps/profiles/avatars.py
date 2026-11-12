"""Avatars: 256x256 WebP through the shared image pipeline (apps/core/images.py, ADR 0010)."""

import uuid

from django.core.files.uploadedfile import UploadedFile

from apps.core import images

MAX_BYTES = 2 * 1024 * 1024
SIZE = 256
PREFIX = "avatars"


def process_avatar(upload: UploadedFile) -> bytes:
    """Validates an uploaded image and returns the re-encoded WebP bytes."""
    return images.reencode(upload, max_bytes=MAX_BYTES, square=SIZE).data


def avatar_path(key: uuid.UUID) -> str:
    return f"{PREFIX}/{key}.webp"


def store_avatar(data: bytes) -> uuid.UUID:
    return images.store(PREFIX, data)


def delete_avatar(key: uuid.UUID | None) -> None:
    images.delete(PREFIX, key)
