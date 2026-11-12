"""Shared image upload pipeline (ADR 0010; used for avatars, project logos and screenshots).

Every upload is untrusted. It is accepted only if
1. its size is within the caller's limit,
2. its first bytes are a PNG, JPEG or WebP signature (not the file name or the declared type),
3. Pillow identifies the same format and the pixel count is within MAX_PIXELS (checked from the
   header, before any pixel data is decoded: protection against decompression bombs),
and it is then decoded and RE-ENCODED as a fresh WebP. The stored file therefore never contains
the uploaded bytes, metadata (EXIF, GPS, XMP, ICC) or extra payloads.
"""

import io
import uuid
import warnings
from dataclasses import dataclass

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_PIXELS = 4096 * 4096
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


@dataclass(frozen=True)
class Encoded:
    data: bytes
    width: int
    height: int


def _has_allowed_signature(head: bytes) -> bool:
    return (
        head.startswith(b"\x89PNG\r\n\x1a\n")
        or head.startswith(b"\xff\xd8\xff")
        or (head[:4] == b"RIFF" and head[8:12] == b"WEBP")
    )


def invalid_image(max_bytes: int) -> ValidationError:
    megabytes = max_bytes // (1024 * 1024)
    return ValidationError(
        f"Upload a PNG, JPEG or WebP image of at most {megabytes} MB.", code="invalid_image"
    )


def reencode(
    upload: UploadedFile, *, max_bytes: int, square: int | None = None, max_side: int | None = None
) -> Encoded:
    """Validates an uploaded image and returns a fresh WebP: cropped to a `square` x `square`
    image, or scaled down (never up) to fit `max_side`."""
    if upload.size is None or upload.size > max_bytes or upload.size == 0:
        raise invalid_image(max_bytes)
    if (upload.content_type or "").lower() not in ALLOWED_CONTENT_TYPES:
        raise invalid_image(max_bytes)
    upload.seek(0)
    if not _has_allowed_signature(upload.read(16)):
        raise invalid_image(max_bytes)
    upload.seek(0)

    try:
        with warnings.catch_warnings():
            # Pillow warns about (and above twice the limit refuses) very large images.
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(upload) as image:
                if image.format not in ALLOWED_FORMATS:
                    raise invalid_image(max_bytes)
                if image.width * image.height > MAX_PIXELS:
                    raise invalid_image(max_bytes)
                image.seek(0)  # animated images: first frame only
                image.load()
                image = ImageOps.exif_transpose(image)
                has_alpha = image.mode in {"RGBA", "LA", "PA"} or "transparency" in image.info
                image = image.convert("RGBA" if has_alpha else "RGB")
                if square:
                    image = ImageOps.fit(image, (square, square), Image.Resampling.LANCZOS)
                elif max_side:
                    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                # No exif/icc/xmp arguments: the new file carries no metadata.
                image.save(output, format="WEBP", quality=85, method=4)
                return Encoded(output.getvalue(), image.width, image.height)
    except ValidationError:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        OSError,
        SyntaxError,
        ValueError,
    ) as exc:
        raise invalid_image(max_bytes) from exc


def store(prefix: str, data: bytes) -> uuid.UUID:
    key = uuid.uuid4()
    default_storage.save(f"{prefix}/{key}.webp", ContentFile(data))
    return key


def delete(prefix: str, key: uuid.UUID | None) -> None:
    if key is not None:
        default_storage.delete(f"{prefix}/{key}.webp")
