"""Avatar upload pipeline (docs/SECURITY.md, "Uploads").

Every upload is untrusted. It is accepted only if
1. its size is within MAX_BYTES,
2. its first bytes are a PNG, JPEG or WebP signature (not the file name or the declared type),
3. Pillow identifies the same format and the pixel count is within MAX_PIXELS (checked from the
   header, before any pixel data is decoded: protection against decompression bombs),
and it is then decoded and RE-ENCODED as a fresh 256x256 WebP. The stored file therefore never
contains the uploaded bytes, metadata (EXIF, GPS, XMP, ICC) or extra payloads.
"""

import io
import uuid
import warnings

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 2 * 1024 * 1024
MAX_PIXELS = 4096 * 4096
SIZE = 256
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


def _has_allowed_signature(head: bytes) -> bool:
    return (
        head.startswith(b"\x89PNG\r\n\x1a\n")
        or head.startswith(b"\xff\xd8\xff")
        or (head[:4] == b"RIFF" and head[8:12] == b"WEBP")
    )


def _invalid() -> ValidationError:
    return ValidationError(
        "Upload a PNG, JPEG or WebP image of at most 2 MB.", code="invalid_image"
    )


def process_avatar(upload: UploadedFile) -> bytes:
    """Validates an uploaded image and returns the re-encoded WebP bytes."""
    if upload.size is None or upload.size > MAX_BYTES or upload.size == 0:
        raise _invalid()
    if (upload.content_type or "").lower() not in ALLOWED_CONTENT_TYPES:
        raise _invalid()
    upload.seek(0)
    if not _has_allowed_signature(upload.read(16)):
        raise _invalid()
    upload.seek(0)

    try:
        with warnings.catch_warnings():
            # Pillow warns about (and above twice the limit refuses) very large images.
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(upload) as image:
                if image.format not in ALLOWED_FORMATS:
                    raise _invalid()
                if image.width * image.height > MAX_PIXELS:
                    raise _invalid()
                image.seek(0)  # animated images: first frame only
                image.load()
                image = ImageOps.exif_transpose(image)
                has_alpha = image.mode in {"RGBA", "LA", "PA"} or "transparency" in image.info
                image = image.convert("RGBA" if has_alpha else "RGB")
                image = ImageOps.fit(image, (SIZE, SIZE), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                # No exif/icc/xmp arguments: the new file carries no metadata.
                image.save(output, format="WEBP", quality=85, method=4)
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
        raise _invalid() from exc
    return output.getvalue()


def avatar_path(key: uuid.UUID) -> str:
    return f"avatars/{key}.webp"


def store_avatar(data: bytes) -> uuid.UUID:
    key = uuid.uuid4()
    default_storage.save(avatar_path(key), ContentFile(data))
    return key


def delete_avatar(key: uuid.UUID | None) -> None:
    if key is not None:
        default_storage.delete(avatar_path(key))
