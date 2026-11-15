"""Data minimisation for GitHub sign-in (owner's decision 2026-11-15, question Z).

django-allauth stores the whole public GitHub profile that GitHub sends at sign-in in
``SocialAccount.extra_data`` (display name, avatar, bio, location, company, ...). The platform
needs only the account number, the username (shown in the security settings) and the profile
link. Everything else is dropped before saving, on the first sign-in and on every later one.
"""

GITHUB_KEPT_FIELDS = ("id", "login", "html_url")


def minimal_github_data(extra_data) -> dict:
    if not isinstance(extra_data, dict):
        return {}
    return {key: extra_data[key] for key in GITHUB_KEPT_FIELDS if key in extra_data}
