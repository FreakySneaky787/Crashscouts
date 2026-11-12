# 0010 – Image upload pipeline (avatars first)

- Status: Accepted
- Date: 2026-11-12

## Context

The project owner decided that avatars can be uploaded already in WP 1.2 (instead of waiting for
the upload work in phase 2). Avatars are the first untrusted files on the platform. The rules in
[`SECURITY.md`](../SECURITY.md) ("Uploads") apply; this ADR records how they are implemented for
images, so that screenshots (phase 2) and feedback attachments (phase 5) reuse the same approach.

## Decision

1. **Accept** only PNG, JPEG and WebP, at most 2 MB. Checks in this order: request size (before the
   body is parsed, in the SSR server and in Django), declared content type, **magic bytes**, the
   format Pillow identifies, and the pixel count from the header (at most 4096×4096) **before**
   any pixel data is decoded (decompression bombs). Pillow's own bomb warning is turned into an
   error as a second guard.
2. **Re-encode** every accepted image with Pillow 13.0.0 (MIT-CMU): first frame only, orientation
   applied, cropped to a square, 256×256, saved as a new WebP **without** EXIF, GPS, XMP or ICC
   data. The uploaded bytes are never stored.
3. **Store** under a random UUIDv4 name (`avatars/<uuid>.webp`) in `MEDIA_ROOT`, outside any web
   root, with restrictive file permissions. There is no `MEDIA_URL` route: files are never served
   directly by a web server.
4. **Serve** through a plain Django view that checks visibility (active account with a confirmed
   email address) and sets `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`,
   `Content-Security-Policy: default-src 'none'; sandbox` and a short public cache. The SSR server
   streams it under the same origin (`/avatars/<uuid>`), so the page CSP `img-src 'self'` applies
   and no backend address is exposed. A new upload gets a new name; old files are deleted after
   the database change is committed.
5. **Rate limit** uploads per user (DRF `ScopedRateThrottle`, 10 per hour).

Avatars are images meant to be displayed, so they are served `inline`; other attachment types
(phase 5) keep `Content-Disposition: attachment`.

## Alternatives

- Store the original and convert on the fly: rejected; the original may carry metadata or
  payloads and conversion on every request costs CPU.
- Serve via `MEDIA_URL` from the reverse proxy: rejected; no visibility check, and a wrong proxy
  configuration could expose all files.
- A DRF view for the image: rejected after an E2E finding – DRF's content negotiation answers
  `Accept: image/*` with 406.

## Consequences

- Production needs a persistent `DJANGO_MEDIA_ROOT` (or later an S3-compatible storage at the
  hosting provider) and the reverse proxy must limit request bodies (a few MB) in front of both
  the SSR server and Django.
- Account deletion (WP 1.5) must delete the avatar file.

## Sources

- Pillow 13.0.0 on PyPI (version, licence MIT-CMU, Python ≥ 3.11): https://pypi.org/project/pillow/13.0.0/
- Pillow decompression bomb protection: https://pillow.readthedocs.io/en/stable/reference/Image.html#PIL.Image.open
- File signatures: PNG (RFC 2083, section 3.1), JPEG (SOI marker `FF D8`), WebP (RIFF container,
  https://developers.google.com/speed/webp/docs/riff_container)
