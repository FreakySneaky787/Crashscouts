"""Creates test data for the SSR E2E tests (dev/test only).

Passwords come exclusively from environment variables (never from arguments, so they do not end
up in process lists or shell history). Output: JSON with the IDs of the probe objects.
"""

import json
import os

from allauth.account.models import EmailAddress
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.ssr_probe.models import ProbeItem


class Command(BaseCommand):
    help = "Create SSR probe test users and items (dev/test only)."

    def handle(self, *args, **options):
        if not settings.ENABLE_SSR_PROBE:
            raise CommandError("SSR probe is disabled in these settings.")

        owner_password = os.environ.get("PROBE_OWNER_PASSWORD")
        stranger_password = os.environ.get("PROBE_STRANGER_PASSWORD")
        if not owner_password or not stranger_password:
            raise CommandError("PROBE_OWNER_PASSWORD and PROBE_STRANGER_PASSWORD must be set.")

        user_model = get_user_model()
        with transaction.atomic():
            owner = self._user(user_model, "probe-owner", owner_password)
            self._user(user_model, "probe-stranger", stranger_password)
            ProbeItem.objects.filter(owner=owner).delete()
            public = ProbeItem.objects.create(
                title="Public probe item",
                description="A public item rendered on the server.",
                is_public=True,
                owner=owner,
            )
            private = ProbeItem.objects.create(
                title="Private probe item",
                description="Only the owner may see this.",
                is_public=False,
                owner=owner,
            )

        self.stdout.write(json.dumps({"public_id": str(public.pk), "private_id": str(private.pk)}))

    @staticmethod
    def _user(user_model, username: str, password: str):
        # Reserved test domain (RFC 2606); the address is marked as verified so the user can log in.
        email = f"{username}@example.test"
        user, _ = user_model.objects.get_or_create(username=username)
        user.email = email
        user.set_password(password)
        user.is_staff = False
        user.is_superuser = False
        user.save()
        EmailAddress.objects.filter(user=user).delete()
        EmailAddress.objects.create(user=user, email=email, verified=True, primary=True)
        return user
