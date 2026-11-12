"""Every account has a profile; new accounts get one from a post_save receiver."""

import uuid

from django.db import migrations


def create_missing(apps, schema_editor):
    user_model = apps.get_model("accounts", "User")
    profile_model = apps.get_model("profiles", "Profile")
    missing = user_model.objects.filter(profile__isnull=True)
    profile_model.objects.bulk_create(profile_model(id=uuid.uuid4(), user=user) for user in missing)


class Migration(migrations.Migration):
    dependencies = [
        ("profiles", "0001_initial"),
        ("accounts", "0002_email_login_and_age_confirmation"),
    ]

    operations = [migrations.RunPython(create_missing, migrations.RunPython.noop)]
