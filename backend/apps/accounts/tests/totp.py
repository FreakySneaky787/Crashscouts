"""Independent RFC 6238 TOTP implementation for tests (SHA-1, 6 digits, 30-second steps)."""

import base64
import hashlib
import hmac
import struct
import time


def totp(secret_base32: str, at: float | None = None, step: int = 30, digits: int = 6) -> str:
    key = base64.b32decode(secret_base32.upper() + "=" * (-len(secret_base32) % 8))
    counter = int((time.time() if at is None else at) // step)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 10**digits
    return str(code).zfill(digits)
