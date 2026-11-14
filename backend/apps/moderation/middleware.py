"""The write guard for suspended accounts (WP 7.2, ADR 0027).

One central place instead of a check in every view: every writing request (anything but GET, HEAD,
OPTIONS) of a suspended account is refused with 403 ``{"code": "account_suspended"}``, except the
paths below (owner's decision 2026-11-14: sign out, export and delete the account, appeal, change
the password and two-factor methods; signing in again needs the authentication steps). A test
walks every route of the project so that a new writing route cannot slip through.
"""

from django.http import JsonResponse

from .suspensions import is_suspended

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
AUTH = "/_allauth/browser/v1/"

ALLOWED_PATHS = frozenset(
    {
        # Signing out (DELETE) and the steps of signing in or confirming one's identity.
        f"{AUTH}auth/session",
        f"{AUTH}auth/login",
        f"{AUTH}auth/code/confirm",
        f"{AUTH}auth/2fa/authenticate",
        f"{AUTH}auth/webauthn/authenticate",
        f"{AUTH}auth/webauthn/login",
        f"{AUTH}auth/reauthenticate",
        f"{AUTH}auth/2fa/reauthenticate",
        f"{AUTH}auth/webauthn/reauthenticate",
        f"{AUTH}auth/password/request",
        f"{AUTH}auth/password/reset",
        # Password and two-factor methods.
        f"{AUTH}account/password/change",
        f"{AUTH}account/authenticators/totp",
        f"{AUTH}account/authenticators/recovery-codes",
        f"{AUTH}account/authenticators/webauthn",
        # Own data, deletion and the appeal.
        "/api/v1/me/export/",
        "/api/v1/me/deletion/",
        "/api/v1/me/suspension/appeal/",
    }
)


def is_allowed(path: str) -> bool:
    return path in ALLOWED_PATHS


class SuspensionGuard:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if (
            request.method not in SAFE_METHODS
            and getattr(request, "user", None) is not None
            and request.user.is_authenticated
            and not is_allowed(request.path)
            and is_suspended(request.user)
        ):
            return JsonResponse({"code": "account_suspended"}, status=403)
        return self.get_response(request)
