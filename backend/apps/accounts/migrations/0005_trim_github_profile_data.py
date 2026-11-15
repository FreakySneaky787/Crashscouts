"""Trims the GitHub profile data stored before the minimisation (question Z, 2026-11-15)."""

from django.db import migrations

from apps.accounts.socialdata import minimal_github_data


def trim(apps, schema_editor):
    SocialAccount = apps.get_model("socialaccount", "SocialAccount")
    for account in SocialAccount.objects.filter(provider="github").iterator():
        trimmed = minimal_github_data(account.extra_data)
        if trimmed != account.extra_data:
            SocialAccount.objects.filter(pk=account.pk).update(extra_data=trimmed)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_platform_role"),
        ("socialaccount", "0006_alter_socialaccount_extra_data"),
    ]

    operations = [migrations.RunPython(trim, migrations.RunPython.noop)]
