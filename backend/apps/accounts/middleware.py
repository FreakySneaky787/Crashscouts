"""A new session ID after re-authentication (ASVS 5.0 V7.2.4).

Django's ``login()`` already rotates the session key on signing in. allauth's re-authentication
(password, two-factor code, passkey, email code) only records the time in the existing session.
This middleware rotates the key after every successful re-authentication, so a session ID that
was observed before the sensitive step is worthless afterwards. The session data (signed-in
user, re-authentication time) is kept; the old key is deleted.
"""

AUTH = "/_allauth/browser/v1/auth/"
REAUTHENTICATION_PATHS = frozenset(
    {
        f"{AUTH}reauthenticate",
        f"{AUTH}2fa/reauthenticate",
        f"{AUTH}webauthn/reauthenticate",
        f"{AUTH}reauthenticate/code/confirm",
    }
)


class RotateSessionOnReauthentication:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if (
            request.method == "POST"
            and request.path in REAUTHENTICATION_PATHS
            and response.status_code == 200
            and request.user.is_authenticated
        ):
            request.session.cycle_key()
        return response
